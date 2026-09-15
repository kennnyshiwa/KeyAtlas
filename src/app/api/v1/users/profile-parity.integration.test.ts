import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { mkdtemp, rm } from "fs/promises";
import os from "os";
import path from "path";

// Explicit opt-in, loopback-only disposable DB. Never use the ambient DATABASE_URL.
const database = process.env.PROFILE_PARITY_DATABASE_URL;
vi.mock("@/lib/auth", () => ({ auth: async () => null }));

describe.runIf(Boolean(database))("profile parity with real PostgreSQL, storage, API keys and notifications", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let profile: typeof import("./[username]/route");
  let follow: typeof import("./[username]/follow/route");
  let avatar: typeof import("./me/avatar/route");
  let legacy: typeof import("../../upload/route");
  let settings: typeof import("./me/route");
  let preferences: typeof import("../notification-preferences/route");
  let retrieval: typeof import("../../../uploads/[...slug]/route");
  let dir: string;
  const run = randomUUID();
  const actorId = `parity-actor-${run}`;
  const targetId = `parity-target-${run}`;
  const username = `parity-${run}`;
  const key = `kv_${randomUUID()}`;
  const context = () => ({ params: Promise.resolve({ username }) });
  function req(method = "GET", authenticated = true, body?: BodyInit) {
    return new NextRequest("http://localhost/api/v1/users/me", {
      method, body, headers: authenticated ? { authorization: `Bearer ${key}` } : {},
    });
  }
  beforeAll(async () => {
    const url = new URL(database!);
    if (url.hostname !== "127.0.0.1" || !url.pathname.startsWith("/profile_parity_")) {
      throw new Error("Integration requires loopback profile_parity_* disposable database");
    }
    vi.stubEnv("DATABASE_URL", database!); vi.stubEnv("REDIS_URL", "");
    vi.stubEnv("STORAGE_PROVIDER", "local");
    dir = await mkdtemp(path.join(os.tmpdir(), "profile-parity-integration-"));
    vi.stubEnv("UPLOAD_DIR", path.relative(process.cwd(), dir));
    ({ prisma } = await import("@/lib/prisma"));
    const { hashKey } = await import("@/lib/api-auth");
    profile = await import("./[username]/route"); follow = await import("./[username]/follow/route");
    legacy = await import("../../upload/route");
    avatar = await import("./me/avatar/route"); settings = await import("./me/route");
    preferences = await import("../notification-preferences/route");
    retrieval = await import("../../../uploads/[...slug]/route");
    await prisma.user.createMany({ data: [
      { id: actorId, username: `actor-${run}`, name: "Synthetic actor", role: "USER" },
      { id: targetId, username, name: "Synthetic target", email: `private-${run}@example.invalid`, passwordHash: "private", role: "USER" },
    ] });
    await prisma.apiKey.create({ data: { userId: actorId, name: "parity-test", key: hashKey(key), prefix: "kv_test" } });
    await prisma.notificationPreference.create({ data: { userId: targetId, type: "NEW_FOLLOWERS", inApp: true, email: false } });
  });
  afterAll(async () => {
    if (prisma) {
      await prisma.imageAsset.deleteMany({ where: { uploaderId: actorId } });
      await prisma.user.deleteMany({ where: { id: { in: [actorId, targetId] } } });
      expect(await prisma.follow.count({ where: { OR: [{ userId: actorId }, { targetId }] } })).toBe(0);
      expect(await prisma.notification.count({ where: { userId: targetId } })).toBe(0);
      expect(await prisma.apiKey.count({ where: { userId: actorId } })).toBe(0);
      await prisma.$disconnect();
    }
    if (dir) await rm(dir, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });
  it("serves anonymous native root profile without private fields", async () => {
    const response = await profile.GET(req("GET", false), context());
    expect(response.status).toBe(200); const body = await response.json();
    expect(body.id).toBe(targetId); expect(body.is_following).toBe(false);
    expect(JSON.stringify(body)).not.toContain("private");
    expect(body).not.toHaveProperty("email"); expect(body.data).not.toHaveProperty("email");
  });
  it("uses real ON CONFLICT for 12 simultaneous adds: one relationship and one notification; duplicate delete is safe", async () => {
    const responses = await Promise.all(Array.from({ length: 12 }, () => follow.POST(req("POST"), context())));
    expect(responses.filter(r => r.status === 201)).toHaveLength(1);
    expect(responses.filter(r => r.status === 200)).toHaveLength(11);
    expect(await prisma.follow.count({ where: { userId: actorId, targetId } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: targetId, type: "NEW_FOLLOWER" } })).toBe(1);
    expect((await (await profile.GET(req(), context())).json()).is_following).toBe(true);
    expect((await (await profile.GET(req("GET", false), context())).json()).is_following).toBe(false);
    expect((await follow.DELETE(req("DELETE"), context())).status).toBe(200);
    expect((await follow.DELETE(req("DELETE"), context())).status).toBe(200);
    expect(await prisma.follow.count({ where: { userId: actorId, targetId } })).toBe(0);
    expect((await (await profile.GET(req(), context())).json()).is_following).toBe(false);
  });
  it("preserves legacy JFIF upload, ImageAsset ownership, hash dedup and public retrieval", async () => {
    const sharp = (await import("sharp")).default;
    const bytes = await sharp({ create: { width: 5, height: 5, channels: 3, background: "blue" } }).jpeg().toBuffer();
    const upload = async () => {
      const body = new FormData();
      body.set("file", new File([new Uint8Array(bytes)], "camera.jfif", { type: "image/jpeg" }));
      return legacy.POST(req("POST", true, body));
    };
    const response = await upload(); expect(response.status).toBe(200);
    const { url } = await response.json(); expect(url).toMatch(/\.jfif$/);
    const asset = await prisma.imageAsset.findFirstOrThrow({ where: { url, uploaderId: actorId } });
    expect(asset.bytes).toBe(bytes.length); expect(asset.contentType).toBe("image/jpeg");
    const read = await retrieval.GET(new Request(`http://localhost${url}`), {
      params: Promise.resolve({ slug: [url.split("/").pop()] }),
    });
    expect(read.status).toBe(200); expect(read.headers.get("content-type")).toBe("image/jpeg");
    expect(read.headers.get("x-content-type-options")).toBe("nosniff");
    expect(Buffer.from(await read.arrayBuffer())).toEqual(bytes);
    expect(await (await upload()).json()).toEqual({ url, deduplicated: true });
    expect(await prisma.imageAsset.count({ where: { uploaderId: actorId } })).toBe(1);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: actorId } })).image).toBeNull();
  });
  it("uploads real JPEG, retrieves it anonymously, and saves profile plus both installed native preferences without touching target", async () => {
    const sharp = (await import("sharp")).default;
    const bytes = await sharp({ create: { width: 2, height: 2, channels: 3, background: "red" } }).jpeg().toBuffer();
    const body = new FormData();
    body.set("file", new File([new Uint8Array(bytes)], "avatar.jpg", { type: "image/jpeg" }));
    body.set("userId", targetId);
    const response = await avatar.POST(req("POST", true, body));
    expect(response.status).toBe(200); const upload = await response.json();
    expect(upload.id).toBeTypeOf("string");
    const read = await retrieval.GET(new Request(`http://localhost${upload.url}`), {
      params: Promise.resolve({ slug: [upload.url.split("/").pop()] }),
    });
    expect(read.status).toBe(200); expect(Buffer.from(await read.arrayBuffer())).toEqual(bytes);
    expect((await settings.PATCH(req("PATCH", true, JSON.stringify({ username: `saved_${run.slice(0, 8)}`, bio: "Saved after avatar" })))).status).toBe(200);
    for (const type of ["PROJECT_STATUS_CHANGES", "PROJECT_GB_ENDING_SOON"]) {
      expect((await preferences.PATCH(req("PATCH", true, JSON.stringify({ type, inApp: false, email: false })))).status).toBe(200);
    }
    const saved = await prisma.user.findUniqueOrThrow({ where: { id: actorId } });
    expect(saved.image).toBe(upload.url); expect(saved.bio).toBe("Saved after avatar");
    expect(await prisma.notificationPreference.count({ where: { userId: actorId, inApp: false, email: false } })).toBe(2);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: targetId } })).image).toBeNull();
  });
});
