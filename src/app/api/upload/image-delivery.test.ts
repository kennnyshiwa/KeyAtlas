import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import sharp from "sharp";

const m = vi.hoisted(() => ({ find: vi.fn(), create: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: async () => null }));
vi.mock("@/lib/api-auth", () => ({ authenticateApiKey: async () => ({ id: "synthetic-owner" }) }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  imageAsset: { findUnique: m.find, create: m.create }, user: { update: m.update },
} }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: async () => null, RATE_LIMIT_KEY_MGMT: {} }));
// Actual multipart routes, signature validation, storage and public delivery; only
// identity/DB/rate budget are isolated here. Real DB coverage is in profile-parity.integration.
import { POST as legacy } from "./route";
import { POST as avatar } from "../v1/users/me/avatar/route";
import { GET as retrieve } from "../../uploads/[...slug]/route";

let dir: string;
const source = () => sharp({ create: { width: 5, height: 5, channels: 3, background: "blue" } });
function request(bytes: Buffer, name = "avatar.jpg") {
  const body = new FormData();
  body.set("file", new File([new Uint8Array(bytes)], name, { type: "image/jpeg" }));
  return new NextRequest("https://keyatlas.test/api/upload", {
    method: "POST", body, headers: { authorization: "Bearer kv_synthetic" },
  });
}
async function delivery(url: string, bytes: Buffer, type: string) {
  const response = await retrieve(new Request(`https://keyatlas.test${url}`), {
    params: Promise.resolve({ slug: url.slice("/uploads/".length).split("/") }),
  });
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe(type);
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
}
beforeEach(async () => {
  vi.resetAllMocks(); m.find.mockResolvedValue(null);
  dir = await mkdtemp(path.join(os.tmpdir(), "image-delivery-rework-"));
  vi.stubEnv("UPLOAD_DIR", path.relative(process.cwd(), dir));
  vi.stubEnv("STORAGE_PROVIDER", "local");
});
afterEach(async () => {
  vi.unstubAllEnvs(); await rm(dir, { recursive: true, force: true });
});

describe("legacy filename-derived extension contract", () => {
  it.each(["camera.jfif", "camera.JFIF", "camera.jpeg", "camera", "camera.bin", "camera.html"])("uploads and retrieves real JPEG named %s", async name => {
    const bytes = await source().jpeg().toBuffer();
    const response = await legacy(request(bytes, name));
    expect(response.status).toBe(200);
    const { url } = await response.json();
    expect(url).toMatch(new RegExp(`^/uploads/[0-9a-f-]{36}\\${path.extname(name) || ".jpg"}$`));
    expect(m.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      url, bytes: bytes.length, contentType: "image/jpeg", uploaderId: "synthetic-owner",
    }) });
    await delivery(url, bytes, "image/jpeg");
    // Existing content-hash dedup must return the same retrievable asset.
    m.find.mockResolvedValue({ url });
    const duplicate = await legacy(request(bytes, name));
    expect(await duplicate.json()).toEqual({ url, deduplicated: true });
    expect(m.create).toHaveBeenCalledTimes(1);
    expect(await readdir(dir)).toHaveLength(1);
  });
});

describe("truthful avatar image types with actual containers", () => {
  it.each(["jpeg", "png", "webp", "gif", "avif"] as const)("preserves real %s bytes labeled JPEG through upload and retrieval", async format => {
    const bytes = await source().toFormat(format).toBuffer();
    const response = await avatar(request(bytes));
    expect(response.status).toBe(200);
    const { url } = await response.json();
    expect(url.endsWith(`.${format === "jpeg" ? "jpg" : format}`)).toBe(true);
    expect(m.update).toHaveBeenCalledWith({ where: { id: "synthetic-owner" }, data: { image: url } });
    await delivery(url, bytes, `image/${format}`);
    expect(m.create).not.toHaveBeenCalled();
  });
  it("conservatively rejects generic major even on an AVIF-encoded container", async () => {
    const bytes = await source().avif().toBuffer();
    bytes.write("mif1", 8, "ascii"); // Generic HEIF major is outside our supported boundary.
    const response = await avatar(request(bytes));
    expect(response.status).toBe(400);
    expect(m.update).not.toHaveBeenCalled(); expect(await readdir(dir)).toEqual([]);
  });
  it.each(["heic", "mif1"])("rejects real HEIC with %s major before storing or updating the user", async major => {
    // QA's macOS sips-generated real HEIC, not a fabricated magic header.
    const bytes = await readFile(path.join(process.cwd(), "src/lib/security/fixtures/qa-real.heic"));
    bytes.write(major, 8, "ascii");
    const response = await avatar(request(bytes));
    expect(response.status).toBe(400);
    expect(m.update).not.toHaveBeenCalled(); expect(m.create).not.toHaveBeenCalled();
    expect(await readdir(dir)).toEqual([]);
  });
  it("rejects generic containers with no AVIF brand (even outside ftyp)", async () => {
    const bytes = Buffer.alloc(28);
    bytes.writeUInt32BE(20); bytes.write("ftypmif1", 4, "ascii");
    bytes.write("mif1", 16, "ascii"); bytes.write("avif", 24, "ascii");
    expect((await avatar(request(bytes))).status).toBe(400);
    expect(m.update).not.toHaveBeenCalled(); expect(await readdir(dir)).toEqual([]);
  });
});
