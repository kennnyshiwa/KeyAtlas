import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const m = vi.hoisted(() => ({
  auth: vi.fn(), key: vi.fn(), keyUpdate: vi.fn(), user: vi.fn(), users: vi.fn(),
  update: vi.fn(), findFirst: vi.fn(), follow: vi.fn(), add: vi.fn(), remove: vi.fn(),
  notification: vi.fn(), preference: vi.fn(), preferences: vi.fn(),
  limit: vi.fn(), upload: vi.fn(), delete: vi.fn(), email: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ auth: m.auth }));
// Real API-key hashing/validation, magic validation and notification dispatch run below.
vi.mock("@/lib/prisma", () => ({ prisma: {
  apiKey: { findUnique: m.key, update: m.keyUpdate },
  user: { findUnique: m.user, findMany: m.users, update: m.update, findFirst: m.findFirst },
  follow: { findUnique: m.follow, createMany: m.add, deleteMany: m.remove },
  notification: { create: m.notification },
  notificationPreference: { upsert: m.preference, findMany: m.preferences },
} }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: m.limit, RATE_LIMIT_DETAIL: { limit: 30, window: 60 },
  RATE_LIMIT_FOLLOW: { limit: 30, window: 300 }, RATE_LIMIT_KEY_MGMT: { limit: 5, window: 60 },
}));
vi.mock("@/lib/storage", () => ({ getStorageProvider: () => ({ upload: m.upload, delete: m.delete }) }));
vi.mock("@/lib/notifications/email", () => ({ sendNotificationEmail: m.email }));
vi.mock("@/lib/notifications/apns", () => ({ sendAPNSNotification: vi.fn() }));
vi.mock("@/lib/notifications/web-push", () => ({ sendWebPushToDevice: vi.fn() }));
import { GET } from "./[username]/route";
import { POST, DELETE } from "./[username]/follow/route";
import { POST as avatar } from "./me/avatar/route";
import { PATCH as profilePatch } from "./me/route";
import { PATCH as preferencePatch, GET as preferencesGet } from "../notification-preferences/route";
import { hashKey } from "@/lib/api-auth";

const actor = { id: "actor", name: "Actor", username: "actor" };
const target = {
  id: "target", username: "target", name: "Public Name", displayName: "Display",
  image: "/uploads/old.jpg", bio: "Public bio", role: "USER", createdAt: new Date("2026-01-01Z"),
  _count: { projects: 2, followers: 1, following: 3 },
  // Deliberately return more than selected: serialization must still prevent leakage.
  email: "private@example.test", passwordHash: "secret", settings: { private: true },
  notificationPreferences: [{ email: true }], apiKeys: ["secret"], bannedAt: "private",
};
const context = (username = "target") => ({ params: Promise.resolve({ username }) });
function req(method = "GET", authenticated = true, body?: BodyInit, headers: Record<string, string> = {}) {
  return new NextRequest("https://keyatlas.test/api/v1/users/target", {
    method, body, headers: { ...(authenticated ? { authorization: "Bearer kv_test" } : {}), ...headers },
  });
}
const jpeg = new Uint8Array([255, 216, 255, ...Array(16).fill(0)]);
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, ...Array(16).fill(0)]);
function uploadRequest(bytes = jpeg, type = "image/jpeg", name = "avatar.jpg", authenticated = true) {
  const body = new FormData();
  body.set("file", new File([bytes], name, { type }));
  body.set("userId", "victim"); body.set("url", "/uploads/victim.jpg");
  return req("POST", authenticated, body);
}
let followed: boolean;
beforeEach(() => {
  vi.resetAllMocks(); followed = false;
  m.auth.mockResolvedValue(null);
  m.key.mockResolvedValue({ id: "key", user: actor, revoked: false, expiresAt: null });
  m.keyUpdate.mockResolvedValue({}); m.limit.mockResolvedValue(null);
  m.user.mockImplementation(async ({ where }) => where.username === "missing" ? null : where.id === actor.id ? actor : target);
  m.users.mockResolvedValue([{ id: target.id, email: "synthetic@example.test", notificationPreferences: [], pushDevices: [] }]);
  m.follow.mockImplementation(async () => followed ? { id: "follow" } : null);
  m.add.mockImplementation(async () => { const count = followed ? 0 : 1; followed = true; return { count }; });
  m.remove.mockImplementation(async () => { followed = false; return { count: 1 }; });
  m.update.mockImplementation(async ({ data }) => ({ ...actor, ...data }));
  m.upload.mockResolvedValue("/uploads/avatar-generated.jpg"); m.delete.mockResolvedValue(undefined);
  m.findFirst.mockResolvedValue(null); m.preference.mockImplementation(async ({ create }) => create);
  m.preferences.mockResolvedValue([]);
});

describe("actual public profile route", () => {
  it("returns native root required id and snake_case plus the legacy envelope, with a double privacy allowlist", async () => {
    const res = await GET(req("GET", false), context());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ id: "target", avatar_url: target.image, follower_count: 1,
      following_count: 3, created_at: "2026-01-01T00:00:00.000Z", is_following: false,
      data: { id: "target", avatar: target.image, followerCount: 1, followingCount: 3 } });
    for (const forbidden of ["email", "passwordHash", "settings", "notificationPreferences", "apiKeys", "bannedAt"]) {
      expect(body).not.toHaveProperty(forbidden); expect(body.data).not.toHaveProperty(forbidden);
      expect(m.user.mock.calls[0][0].select).not.toHaveProperty(forbidden);
    }
    expect(m.user.mock.calls[0][0].select._count.select.projects).toEqual({ where: { published: true } });
    expect(m.follow).not.toHaveBeenCalled(); expect(m.key).not.toHaveBeenCalled();
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("vary")).toContain("Cookie");
  });
  it.each([false, true])("returns bearer viewer state %s, never another viewer's state", async (state) => {
    followed = state;
    expect((await (await GET(req(), context())).json()).is_following).toBe(state);
    expect(m.key).toHaveBeenCalledWith({ where: { key: hashKey("kv_test") }, include: { user: true } });
    expect(m.follow).toHaveBeenCalledWith({ where: { userId_targetType_targetId: {
      userId: "actor", targetType: "USER", targetId: "target",
    } }, select: { id: true } });
  });
  it("uses browser cookies when provided by auth, but cannot infer absent native credentials", async () => {
    followed = true; m.auth.mockResolvedValue({ user: actor });
    expect((await (await GET(req("GET", false), context())).json()).is_following).toBe(true);
    m.auth.mockResolvedValue(null);
    expect((await (await GET(req("GET", false), context())).json()).is_following).toBe(false);
  });
  it("returns 404 for missing user", async () => expect((await GET(req("GET", false), context("missing"))).status).toBe(404));
  it("applies the public read rate budget", async () => {
    m.limit.mockResolvedValue(NextResponse.json({}, { status: 429 }));
    expect((await GET(req("GET", false, undefined, { "x-forwarded-for": "192.0.2.1" }), context())).status).toBe(429);
    expect(m.limit.mock.calls[0][0]).toBe("anonymous:192.0.2.1"); expect(m.user).not.toHaveBeenCalled();
  });
});

describe("actual bearer validation across profile/follow/avatar", () => {
  it.each(["revoked", "expired", "unknown", "malformed"])("rejects %s credentials without cookie fallback", async (kind) => {
    if (kind === "revoked") m.key.mockResolvedValue({ user: actor, revoked: true });
    if (kind === "expired") m.key.mockResolvedValue({ user: actor, expiresAt: new Date(0) });
    if (kind === "unknown") m.key.mockResolvedValue(null);
    m.auth.mockResolvedValue({ user: actor });
    const headers: Record<string, string> = kind === "malformed" ? { authorization: "Basic invalid" } : {};
    expect((await GET(req("GET", true, undefined, headers), context())).status).toBe(401);
    expect((await POST(req("POST", true, undefined, headers), context())).status).toBe(401);
    expect((await DELETE(req("DELETE", true, undefined, headers), context())).status).toBe(401);
    expect((await avatar(req("POST", true, undefined, headers))).status).toBe(401);
    expect(m.auth).not.toHaveBeenCalled(); expect(m.add).not.toHaveBeenCalled(); expect(m.upload).not.toHaveBeenCalled();
  });
});

describe("actual user follow routes and notification service", () => {
  it("denies anonymous add/delete and rejects self-follow", async () => {
    expect((await POST(req("POST", false), context())).status).toBe(401);
    expect((await DELETE(req("DELETE", false), context())).status).toBe(401);
    m.user.mockResolvedValue(actor);
    expect((await POST(req("POST"), context())).status).toBe(400);
    expect((await DELETE(req("DELETE"), context())).status).toBe(400);
    expect(m.add).not.toHaveBeenCalled(); expect(m.remove).not.toHaveBeenCalled();
  });
  it("handles missing targets on both methods", async () => {
    expect((await POST(req("POST"), context("missing"))).status).toBe(404);
    expect((await DELETE(req("DELETE"), context("missing"))).status).toBe(404);
  });
  it("adds once for concurrent/duplicate calls and creates one NEW_FOLLOWER via the real dispatcher", async () => {
    const responses = await Promise.all(Array.from({ length: 8 }, () => POST(req("POST"), context())));
    expect(responses.map(r => r.status).sort()).toEqual([200, 200, 200, 200, 200, 200, 200, 201]);
    expect(m.add).toHaveBeenCalledWith({ data: [{ userId: "actor", targetType: "USER", targetId: "target", targetUserId: "target" }], skipDuplicates: true });
    expect(m.notification).toHaveBeenCalledTimes(1);
    expect(m.notification.mock.calls[0][0].data).toMatchObject({ userId: "target", type: "NEW_FOLLOWER", link: "/users/actor" });
    expect(m.email).not.toHaveBeenCalled();
    expect((await (await GET(req(), context())).json()).is_following).toBe(true);
    expect((await DELETE(req("DELETE"), context())).status).toBe(200);
    expect((await DELETE(req("DELETE"), context())).status).toBe(200);
    expect(m.remove).toHaveBeenCalledWith({ where: { userId: "actor", targetType: "USER", targetId: "target" } });
    expect((await (await GET(req(), context())).json()).is_following).toBe(false);
    expect(m.notification).toHaveBeenCalledTimes(1);
  });
  it("respects recipient notification preferences", async () => {
    m.users.mockResolvedValue([{ id: "target", notificationPreferences: [{ inApp: false, email: false }], pushDevices: [] }]);
    expect((await POST(req("POST"), context())).status).toBe(201);
    expect(m.notification).not.toHaveBeenCalled();
  });
  it("uses cookie identity and rejects cross-origin cookie mutations", async () => {
    m.auth.mockResolvedValue({ user: actor });
    expect((await POST(req("POST", false), context())).status).toBe(201);
    expect((await DELETE(req("DELETE", false, undefined, { origin: "https://evil.test" }), context())).status).toBe(401);
    expect((await DELETE(req("DELETE", false, undefined, { origin: "https://keyatlas.test" }), context())).status).toBe(200);
  });
  it("validates browser Origin against the public Host behind Next's normalized internal URL", async () => {
    m.auth.mockResolvedValue({ user: actor });
    const request = new NextRequest("http://localhost:3000/api/v1/users/target/follow", {
      method: "POST", headers: { host: "keyatlas.test", "x-forwarded-proto": "https", origin: "https://keyatlas.test" },
    });
    expect((await POST(request, context())).status).toBe(201);
  });
  it("shares browser rate limits for POST and DELETE", async () => {
    m.limit.mockResolvedValue(NextResponse.json({}, { status: 429 }));
    expect((await POST(req("POST"), context())).status).toBe(429);
    expect((await DELETE(req("DELETE"), context())).status).toBe(429);
    expect(m.limit).toHaveBeenCalledWith("actor", "follow", { limit: 30, window: 300 });
    expect(m.add).not.toHaveBeenCalled();
  });
});

describe("actual avatar route and native settings sequence", () => {
  it("denies anonymous upload before parsing or storage", async () => {
    expect((await avatar(uploadRequest(jpeg, "image/jpeg", "avatar.jpg", false))).status).toBe(401);
    expect(m.upload).not.toHaveBeenCalled();
  });
  it("validates multipart, file presence and rejects string file", async () => {
    expect((await avatar(req("POST", true, "broken"))).status).toBe(400);
    const body = new FormData();
    expect((await avatar(req("POST", true, body))).status).toBe(400);
    body.set("file", "not a file");
    expect((await avatar(req("POST", true, body))).status).toBe(400);
    expect(m.upload).not.toHaveBeenCalled();
  });
  it.each(["text/html", "image/svg+xml", "application/octet-stream", "toString"])("rejects declared type %s", async type => {
    expect((await avatar(uploadRequest(jpeg, type))).status).toBe(400); expect(m.upload).not.toHaveBeenCalled();
  });
  it("rejects bad magic and empty files even labeled JPEG", async () => {
    expect((await avatar(uploadRequest(new TextEncoder().encode("<html>bad image</html>")))).status).toBe(400);
    expect((await avatar(uploadRequest(new Uint8Array()))).status).toBe(400);
    expect(m.upload).not.toHaveBeenCalled();
  });
  it("bounds the complete multipart body even without Content-Length", async () => {
    // Use HTTP wire bytes, not Undici's synthetic FormData encoder (whose async
    // enqueue races cancellation). Incoming server requests already contain bytes.
    const body = new TextEncoder().encode(
      '--test\r\nContent-Disposition: form-data; name="extra"\r\n\r\n' +
      "x".repeat(2 * 1024 * 1024 + 64 * 1024) + '\r\n--test--\r\n'
    );
    expect((await avatar(req("POST", true, body, {
      "content-type": "multipart/form-data; boundary=test",
    }))).status).toBe(400);
    expect(m.upload).not.toHaveBeenCalled();
  });
  it("accepts exactly 2MB and rejects 2MB+1", async () => {
    const bytes = new Uint8Array(2 * 1024 * 1024); bytes.set(jpeg);
    expect((await avatar(uploadRequest(bytes))).status).toBe(200);
    m.upload.mockClear();
    expect((await avatar(uploadRequest(new Uint8Array(bytes.length + 1)))).status).toBe(400);
    expect(m.upload).not.toHaveBeenCalled();
  });
  it("ignores hostile filename/owner/url and returns native root url/id with generated safe paths", async () => {
    const res = await avatar(uploadRequest(jpeg, "image/jpeg", '../../victim<script>.html'));
    expect(res.status).toBe(200);
    const result = await res.json();
    expect(result.url).toBe("/uploads/avatar-generated.jpg"); expect(result.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(m.upload.mock.calls[0][1]).toBe(`avatar-${result.id}.jpg`);
    expect(m.upload.mock.calls[0][3]).toEqual({ userId: "actor", originalFilename: `avatar-${result.id}.jpg` });
    expect(m.update).toHaveBeenCalledWith({ where: { id: "actor" }, data: { image: result.url } });
    expect(m.delete).not.toHaveBeenCalled();
  });
  it("uses detected PNG type for installed native JPEG-labelled PhotosPicker bytes", async () => {
    expect((await avatar(uploadRequest(png))).status).toBe(200);
    expect(m.upload.mock.calls[0][1]).toMatch(/\.png$/); expect(m.upload.mock.calls[0][2]).toBe("image/png");
  });
  it("supports browser avatar identity and rate limits", async () => {
    m.auth.mockResolvedValue({ user: actor });
    expect((await avatar(uploadRequest(jpeg, "image/jpeg", "avatar.jpg", false))).status).toBe(200);
    m.limit.mockResolvedValue(NextResponse.json({}, { status: 429 })); m.upload.mockClear();
    expect((await avatar(uploadRequest())).status).toBe(429); expect(m.upload).not.toHaveBeenCalled();
  });
  it("handles storage failure without updating user or exposing provider secrets", async () => {
    m.upload.mockRejectedValue(new Error("secret provider details"));
    const res = await avatar(uploadRequest()); expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toContain("secret"); expect(m.update).not.toHaveBeenCalled();
  });
  it("cleans only this new object when user save fails, and reports cleanup failure", async () => {
    m.update.mockRejectedValue(new Error("DB unavailable"));
    expect((await avatar(uploadRequest())).status).toBe(500);
    expect(m.delete).toHaveBeenCalledWith("/uploads/avatar-generated.jpg");
    m.delete.mockRejectedValue(new Error("Storage unavailable"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await avatar(uploadRequest())).status).toBe(500);
    expect(log).toHaveBeenCalledWith("Avatar cleanup failed", { userId: "actor", url: "/uploads/avatar-generated.jpg" });
    log.mockRestore();
  });
  it("preserves avatar through native username/bio PATCH and both notification preference saves", async () => {
    let saved = { ...actor, image: "old", bio: "" };
    m.update.mockImplementation(async ({ data }) => { saved = { ...saved, ...data }; return saved; });
    expect((await avatar(uploadRequest())).status).toBe(200);
    expect((await profilePatch(req("PATCH", true, JSON.stringify({ username: "new_actor", bio: "New bio" })))).status).toBe(200);
    for (const type of ["PROJECT_STATUS_CHANGES", "PROJECT_GB_ENDING_SOON"]) {
      expect((await preferencePatch(req("PATCH", true, JSON.stringify({ type, inApp: false, email: false })))).status).toBe(200);
      expect(m.preference).toHaveBeenCalledWith({ where: { userId_type: { userId: "actor", type } },
        create: { userId: "actor", type, inApp: false, email: false }, update: { inApp: false, email: false } });
    }
    expect(saved).toMatchObject({ id: "actor", username: "new_actor", bio: "New bio", image: "/uploads/avatar-generated.jpg" });
    m.preferences.mockResolvedValue(m.preference.mock.calls.map(([arg]) => arg.create));
    expect((await (await preferencesGet(req())).json()).data).toEqual(expect.arrayContaining([
      { type: "PROJECT_STATUS_CHANGES", inApp: false, email: false },
      { type: "PROJECT_GB_ENDING_SOON", inApp: false, email: false },
    ]));
  });
});
