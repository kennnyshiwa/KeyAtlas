import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, symlink, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { LocalStorage } from "@/lib/storage/local";
import { GET } from "./route";

let dir: string;
let outside: string;
const bytes = Buffer.from([255, 216, 255, ...Array(16).fill(0)]);
const get = (slug: string[]) => GET(new Request("https://keyatlas.test/uploads/test.jpg"), { params: Promise.resolve({ slug }) });
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "profile-avatar-"));
  outside = await mkdtemp(path.join(os.tmpdir(), "profile-avatar-outside-"));
  vi.stubEnv("UPLOAD_DIR", path.relative(process.cwd(), dir));
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(dir, { recursive: true, force: true });
  await rm(outside, { recursive: true, force: true });
});
describe("actual local avatar storage and public retrieval", () => {
  it("writes actual bytes, publicly retrieves typed immutable image, then removes exact object", async () => {
    const storage = new LocalStorage();
    const url = await storage.upload(bytes, "avatar-test.jpg", "image/jpeg", { userId: "synthetic" });
    expect(url).toBe("/uploads/avatar-test.jpg");
    expect(await readFile(path.join(dir, "avatar-test.jpg"))).toEqual(bytes);
    const res = await get(["avatar-test.jpg"]);
    expect(res.status).toBe(200); expect(Buffer.from(await res.arrayBuffer())).toEqual(bytes);
    expect(res.headers.get("Content-Type")).toBe("image/jpeg");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Cache-Control")).toContain("immutable");
    await storage.delete(url); expect((await get(["avatar-test.jpg"])).status).toBe(404);
  });
  it.each([["..", "secret.jpg"], ["../secret.jpg"], ["..\\secret.jpg"], ["x\".jpg"], ["%2e%2e.jpg"], ["x\u0000.jpg"]])("denies unsafe path %j", async (...slug) => {
    expect((await get(slug)).status).toBe(400);
  });
  it("denies non-image content, missing files, empty paths and symlink escape", async () => {
    await writeFile(path.join(dir, "payload.html"), "<script>alert(1)</script>");
    expect((await get(["payload.html"])).status).toBe(404);
    for (const extension of ["jpg", "jfif", "avif"]) {
      await writeFile(path.join(dir, `payload.${extension}`), "<script>alert(1)</script>");
      expect((await get([`payload.${extension}`])).status).toBe(404);
    }
    expect((await get(["missing.jpg"])).status).toBe(404);
    expect((await get([])).status).toBe(404);
    await writeFile(path.join(outside, "secret.jpg"), "secret");
    await symlink(path.join(outside, "secret.jpg"), path.join(dir, "escape.jpg"));
    expect((await get(["escape.jpg"])).status).toBe(400);
  });
});
