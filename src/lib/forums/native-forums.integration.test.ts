import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { Pool } from "pg";
import { NextRequest } from "next/server";
import type { PrismaClient } from "@/generated/prisma/client";
vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => null) }));
// ALL external sends are intercepted, even when testing enabled preferences/devices.
vi.mock("@/lib/notifications/email", () => ({ sendNotificationEmail: vi.fn(async () => {}) }));
vi.mock("@/lib/notifications/apns", () => ({ sendAPNSNotification: vi.fn(async () => {}) }));
vi.mock("@/lib/notifications/web-push", () => ({ sendWebPushToDevice: vi.fn(async () => {}) }));
import { auth } from "@/lib/auth";
import { sendNotificationEmail } from "@/lib/notifications/email";
import { sendAPNSNotification } from "@/lib/notifications/apns";
import { sendWebPushToDevice } from "@/lib/notifications/web-push";
import * as limits from "@/lib/rate-limit";

const databaseUrl = process.env.KEYATLAS_TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)("native forum production routes / PostgreSQL", () => {
  let db: PrismaClient;
  let pool: Pool;
  let create: typeof import("@/app/api/v1/forums/threads/route").POST;
  let detail: typeof import("@/app/api/v1/forums/threads/[threadId]/route").GET;
  let reply: typeof import("@/app/api/v1/forums/threads/[threadId]/posts/route").POST;
  let slugCreate: typeof import("@/app/api/v1/forums/[slug]/threads/route").POST;
  let webCreate: typeof import("@/app/api/forums/[categorySlug]/threads/route").POST;
  let webReply: typeof import("@/app/api/forums/threads/[threadId]/posts/route").POST;
  const prefix = `forums-${randomUUID()}`;
  const ids = ["a", "b", "c", "d", "e"].map((s) => `${prefix}-${s}`);
  const [a, b, c, d] = ids;
  const categoryId = `${prefix}-cat`;
  const keys = ids.map(() => `kv_${randomUUID()}`);
  const ctx = (threadId: string) => ({ params: Promise.resolve({ threadId }) });
  const req = (body: unknown, key: string | null = keys[0], extra: Record<string, string> = {}) => new NextRequest("http://localhost/api/v1/forums/threads", {
    method: "POST", headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}), ...extra }, body: typeof body === "string" ? body : JSON.stringify(body),
  });
  const threadBody = (extra = {}) => ({ title: "Fixture topic", content: "Fixture content", category_id: categoryId, ...extra });
  async function thread(extra = {}) {
    const response = await create(req(threadBody(extra))); expect(response.status).toBe(201);
    return (await response.json()).data as { id: string; slug: string };
  }
  async function notifications(type: "NEW_FORUM_THREAD" | "FORUM_REPLY") {
    return db.notification.findMany({ where: { userId: { in: ids }, type }, orderBy: { userId: "asc" } });
  }
  async function followThread(id: string) {
    await db.follow.createMany({ data: [a, b, c, d].map((userId) => ({ userId, targetType: "FORUM_THREAD" as const, targetId: id })) });
  }
  beforeAll(async () => {
    const url = new URL(databaseUrl!);
    if (url.hostname !== "127.0.0.1" || !url.pathname.endsWith("_qa")) throw new Error("Disposable local *_qa DB required");
    vi.stubEnv("DATABASE_URL", databaseUrl!); vi.stubEnv("REDIS_URL", "");
    ({ prisma: db } = await import("@/lib/prisma")); pool = new Pool({ connectionString: databaseUrl });
    ({ POST: create } = await import("@/app/api/v1/forums/threads/route"));
    ({ GET: detail } = await import("@/app/api/v1/forums/threads/[threadId]/route"));
    ({ POST: reply } = await import("@/app/api/v1/forums/threads/[threadId]/posts/route"));
    ({ POST: slugCreate } = await import("@/app/api/v1/forums/[slug]/threads/route"));
    ({ POST: webCreate } = await import("@/app/api/forums/[categorySlug]/threads/route"));
    ({ POST: webReply } = await import("@/app/api/forums/threads/[threadId]/posts/route"));
    const { hashKey } = await import("@/lib/api-auth");
    await db.user.createMany({ data: ids.map((id) => ({ id, name: "Private fallback", displayName: "Public fixture", createdAt: new Date(Date.now() - 48 * 3600000) })) });
    await db.apiKey.createMany({ data: ids.map((userId, i) => ({ userId, key: hashKey(keys[i]), name: "Disposable forums test", prefix: "kv_fixture" })) });
    await db.forumCategory.create({ data: { id: categoryId, slug: categoryId, name: "Disposable category" } });
    await db.follow.createMany({ data: [a, b, c, d].map((userId) => ({ userId, targetType: "FORUM_CATEGORY" as const, targetId: categoryId })) });
    await db.notificationPreference.createMany({ data: ["FORUM_CATEGORY_THREADS", "FORUM_REPLIES"].map((type) => ({ userId: d, type: type as "FORUM_REPLIES", inApp: false, email: false })) });
  });
  beforeEach(async () => {
    vi.restoreAllMocks(); vi.mocked(auth).mockResolvedValue(null as never);
    vi.mocked(sendNotificationEmail).mockReset(); vi.mocked(sendAPNSNotification).mockReset(); vi.mocked(sendWebPushToDevice).mockReset();
    vi.stubEnv("REDIS_URL", ""); limits.__setRedisClientForTests(null);
    await db.notification.deleteMany({ where: { userId: { in: ids } } });
    await db.follow.deleteMany({ where: { userId: { in: ids }, targetType: "FORUM_THREAD" } });
    await db.forumThread.deleteMany({ where: { categoryId } });
  });
  afterAll(async () => {
    if (!db) return;
    await db.forumCategory.delete({ where: { id: categoryId } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect(); await pool.end(); vi.unstubAllEnvs(); limits.__setRedisClientForTests(null);
  });
  it("real bearer validation, explicit invalid bearer cannot fall back; browser cookie/origin supported", async () => {
    expect((await create(req(threadBody(), null))).status).toBe(401);
    expect((await create(req(threadBody(), "kv_missing"))).status).toBe(401);
    vi.mocked(auth).mockResolvedValue({ user: { id: a } } as never);
    expect((await create(req(threadBody(), "invalid"))).status).toBe(401);
    expect((await create(req(threadBody(), null, { origin: "https://evil.invalid" }))).status).toBe(401);
    expect((await create(req(threadBody(), null, { origin: "http://localhost" }))).status).toBe(201);
    await db.apiKey.updateMany({ where: { userId: a }, data: { revoked: true } });
    expect((await create(req(threadBody()))).status).toBe(401);
    await db.apiKey.updateMany({ where: { userId: a }, data: { revoked: false, expiresAt: new Date(0) } });
    expect((await create(req(threadBody()))).status).toBe(401);
    await db.apiKey.updateMany({ where: { userId: a }, data: { expiresAt: null } });
    expect((await reply(req({ content: "reply" }, null), ctx("missing"))).status).toBe(404); // valid cookie reaches lookup
    vi.mocked(auth).mockResolvedValue(null as never);
    expect((await reply(req({ content: "reply" }, null), ctx("missing"))).status).toBe(401);
  });
  it.each([null, [], { title: "ab" }, { title: "x".repeat(201) }, { title: "   " }, { content: "" }, { content: "  \n" }, { content: "x".repeat(50001) }, { category_id: 3 }])("rejects invalid thread input %#", async (input) => {
    const payload = input && !Array.isArray(input) ? threadBody(input) : input;
    expect((await create(req(payload))).status).toBe(400);
    expect(await db.forumThread.count({ where: { categoryId } })).toBe(0);
    expect(await notifications("NEW_FORUM_THREAD")).toHaveLength(0);
  });
  it("JSON, missing category/thread and inclusive length boundaries", async () => {
    expect((await create(req("{"))).status).toBe(400);
    expect((await create(req({}))).status).toBe(400);
    expect((await create(req(threadBody({ category_id: "missing" })))).status).toBe(404);
    expect((await reply(req({ content: "x" }), ctx("missing"))).status).toBe(404);
    await thread({ title: "abc", content: "x" });
    const max = await thread({ title: "x".repeat(200), content: "x".repeat(50000) });
    expect((await reply(req({ content: "x".repeat(50000) }), ctx(max.id))).status).toBe(201);
    for (const content of [null, "", " ", "x".repeat(50001), 3]) expect((await reply(req({ content }), ctx(max.id))).status).toBe(400);
    expect((await reply(req("{"), ctx(max.id))).status).toBe(400);
  });
  it("real anti-spam account-age/link boundaries apply to thread and reply", async () => {
    const t = await thread();
    await db.user.update({ where: { id: b }, data: { createdAt: new Date() } });
    for (const response of [await create(req(threadBody({ content: "https://example.test" }), keys[1])), await reply(req({ content: "https://example.test" }, keys[1]), ctx(t.id))]) {
      expect(response.status).toBe(403); expect((await response.json()).code).toBe("FORUM_CONTENT_REJECTED");
    }
    await db.user.update({ where: { id: b }, data: { createdAt: new Date(Date.now() - 11 * 60000) } });
    expect((await reply(req({ content: "https://a.test https://b.test" }, keys[1]), ctx(t.id))).status).toBe(201);
    expect((await reply(req({ content: "https://a.test https://b.test https://c.test" }, keys[1]), ctx(t.id))).status).toBe(400);
    await db.user.update({ where: { id: b }, data: { createdAt: new Date(Date.now() - 25 * 3600000) } });
    expect((await reply(req({ content: "https://a.test https://b.test https://c.test" }, keys[1]), ctx(t.id))).status).toBe(201);
  });
  it("native lifecycle: public allowlist, nested snake case, dedupe/self suppression/preferences and no sends", async () => {
    const t = await thread(); await followThread(t.id);
    expect((await notifications("NEW_FORUM_THREAD")).map((n) => n.userId).sort()).toEqual([b, c].sort());
    const response = await reply(req({ content: "Native reply" }, keys[1]), ctx(t.id)); expect(response.status).toBe(201);
    const post = (await response.json()).data;
    expect((await notifications("FORUM_REPLY")).map((n) => n.userId).sort()).toEqual([a, c].sort());
    expect((await notifications("FORUM_REPLY"))[0].metadata).toEqual({ threadId: t.id, postId: post.id });
    const responseDetail = await detail(new NextRequest("http://localhost/detail"), ctx(t.id)); expect(responseDetail.status).toBe(200);
    const payload = await responseDetail.json(); const data = payload.data;
    expect(data).toMatchObject({ id: t.id, category_id: categoryId, post_count: 1, is_locked: false, is_pinned: false });
    expect(data.created_at).toMatch(/^\d{4}-/);
    expect(data.posts[0]).toMatchObject({ id: post.id, thread_id: t.id, parent_id: null, content: "Native reply" });
    for (const author of [data.author, data.posts[0].author]) expect(author).toEqual({ id: author.id, username: null, name: "Public fixture", image: null });
    expect(sendNotificationEmail).not.toHaveBeenCalled(); expect(sendAPNSNotification).not.toHaveBeenCalled(); expect(sendWebPushToDevice).not.toHaveBeenCalled();
    if (process.env.FORUM_CONTRACT_OUTPUT) await writeFile(process.env.FORUM_CONTRACT_OUTPUT, JSON.stringify(payload, null, 2));
    expect((await detail(new NextRequest("http://localhost/detail"), ctx("missing"))).status).toBe(404);
  });
  it("parent aliases: same-thread accepted; nonexistent/cross-thread/conflicting rejected; locked prevents writes", async () => {
    const t = await thread(); const other = await thread();
    const parent = (await (await reply(req({ content: "parent" }), ctx(t.id))).json()).data;
    for (const alias of ["parentId", "parent_id"]) {
      const r = await reply(req({ content: "child", [alias]: parent.id }), ctx(t.id)); expect(r.status).toBe(201); expect((await r.json()).data.parentId).toBe(parent.id);
    }
    for (const body of [{ parentId: "missing" }, { parentId: "" }, { parentId: null }, { parentId: parent.id, parent_id: "different" }]) expect((await reply(req({ content: "bad", ...body }), ctx(t.id))).status).toBe(400);
    expect((await reply(req({ content: "bad", parentId: parent.id }), ctx(other.id))).status).toBe(400);
    await db.forumThread.update({ where: { id: t.id }, data: { locked: true } });
    expect((await reply(req({ content: "bad" }), ctx(t.id))).status).toBe(403);
    expect(await db.forumPost.count({ where: { threadId: t.id } })).toBe(3);
  });
  it("concurrent slug collisions including overlapping suffix families and non-Latin titles", async () => {
    const responses = await Promise.all(["Collision", "Collision", "Collision-1", "Collision", "日本語", "日本語"].map((title) => create(req(threadBody({ title })))));
    expect(responses.map((r) => r.status)).toEqual(Array(6).fill(201));
    const threads = await Promise.all(responses.map(async (r) => (await r.json()).data));
    expect(new Set(threads.map((t) => t.slug)).size).toBe(6); expect(threads.every((t) => t.slug.length > 0)).toBe(true);
    expect(await notifications("NEW_FORUM_THREAD")).toHaveLength(12);
  });
  it("all create/reply routes consume identical production rate-limit keys; no cross-path bypass", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: a } } as never);
    const buckets = new Map<string, number>();
    const evalMock = vi.fn(async (_lua: string, _n: number, key: string, _time: number, limit: number) => {
      const count = (buckets.get(key) ?? 0) + 1; buckets.set(key, count); return count <= limit ? [1, limit - count, 0] : [0, 0, 300];
    });
    vi.stubEnv("REDIS_URL", "redis://not-used.invalid"); limits.__setRedisClientForTests({ status: "ready", eval: evalMock } as never);
    const first = await create(req(threadBody())); expect(first.status).toBe(201); const t = (await first.json()).data;
    expect((await slugCreate(req(threadBody()), { params: Promise.resolve({ slug: categoryId }) })).status).toBe(201);
    const web = await webCreate(req(threadBody()), { params: Promise.resolve({ categorySlug: categoryId }) }); expect(web.status).toBe(201); expect((await web.json()).id).toBeTruthy();
    expect((await create(req(threadBody()))).status).toBe(429);
    for (let i = 0; i < 12; i++) expect((await (i % 2 ? webReply : reply)(req({ content: "quota" }), ctx(t.id))).status).toBe(201);
    const limited = await reply(req({ content: "over quota" }), ctx(t.id)); expect(limited.status).toBe(429); expect(limited.headers.get("Retry-After")).toBe("300");
    expect([...buckets.keys()].sort()).toEqual([`rate-limit:${a}:forum:create-post`, `rate-limit:${a}:forum:create-thread`].sort());
  });
  it.runIf(Boolean(process.env.FORUM_TEST_REDIS_URL))("real Redis Lua enforces shared quotas under concurrent cross-path requests", async () => {
    const url = new URL(process.env.FORUM_TEST_REDIS_URL!);
    if (url.hostname !== "127.0.0.1") throw new Error("Disposable loopback Redis required");
    const { default: Redis } = await import("ioredis");
    const redis = new Redis(url.toString());
    const ownedKeys = [`rate-limit:${a}:forum:create-thread`, `rate-limit:${a}:forum:create-post`];
    await redis.ping();
    vi.stubEnv("REDIS_URL", url.toString()); limits.__setRedisClientForTests(redis);
    vi.mocked(auth).mockResolvedValue({ user: { id: a } } as never);
    try {
      const responses = await Promise.all(Array.from({ length: 6 }, (_, i) => i % 3 === 0
        ? create(req(threadBody())) : i % 3 === 1
          ? slugCreate(req(threadBody()), { params: Promise.resolve({ slug: categoryId }) })
          : webCreate(req(threadBody()), { params: Promise.resolve({ categorySlug: categoryId }) })));
      expect(responses.filter((r) => r.status === 201)).toHaveLength(3);
      expect(responses.filter((r) => r.status === 429)).toHaveLength(3);
      const t = await db.forumThread.findFirstOrThrow({ where: { categoryId } });
      const replies = await Promise.all(Array.from({ length: 24 }, (_, i) => (i % 2 ? reply : webReply)(req({ content: "concurrent quota" }), ctx(t.id))));
      expect(replies.filter((r) => r.status === 201)).toHaveLength(12);
      expect(replies.filter((r) => r.status === 429)).toHaveLength(12);
      expect(await db.forumPost.count({ where: { threadId: t.id } })).toBe(12);
      expect(await redis.exists(...ownedKeys)).toBe(2);
    } finally { await redis.del(...ownedKeys); await redis.quit(); limits.__setRedisClientForTests(null); }
  });
  it("commit-time failure discards staged notifications and never starts external delivery", async () => {
    const t = await thread(); await followThread(t.id);
    await pool.query(`CREATE FUNCTION forums_commit_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."threadId" = '${t.id}' THEN RAISE EXCEPTION 'fixture commit failure'; END IF; RETURN NEW; END $$`);
    await pool.query('CREATE CONSTRAINT TRIGGER forums_commit_fail AFTER INSERT ON forum_posts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION forums_commit_fail()');
    try {
      await expect(reply(req({ content: "commit rollback" }, keys[1]), ctx(t.id))).rejects.toThrow();
      expect(await db.forumPost.count({ where: { threadId: t.id } })).toBe(0);
      expect(await notifications("FORUM_REPLY")).toHaveLength(0);
      expect(sendNotificationEmail).not.toHaveBeenCalled(); expect(sendAPNSNotification).not.toHaveBeenCalled(); expect(sendWebPushToDevice).not.toHaveBeenCalled();
    } finally { await pool.query('DROP TRIGGER forums_commit_fail ON forum_posts'); await pool.query('DROP FUNCTION forums_commit_fail()'); }
  });
  async function blocked(queryPart: string) {
    for (let i = 0; i < 200; i++) {
      const rows = await pool.query("SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE $1", [`%${queryPart}%`]);
      if (rows.rowCount) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error("Expected route blocked on row lock");
  }
  it("concurrent moderation lock wins before reply validates; no content/notification event", async () => {
    const t = await thread(); const writer = await pool.connect(); let pending: ReturnType<typeof reply> | undefined;
    try {
      await writer.query("BEGIN"); await writer.query('UPDATE forum_threads SET locked=true WHERE id=$1', [t.id]);
      pending = reply(req({ content: "racing", }, keys[1]), ctx(t.id)); await blocked("FOR UPDATE"); await writer.query("COMMIT");
      expect((await pending).status).toBe(403); expect(await db.forumPost.count({ where: { threadId: t.id } })).toBe(0); expect(await notifications("FORUM_REPLY")).toHaveLength(0);
    } finally { await writer.query("ROLLBACK"); writer.release(); if (pending) await pending.catch(() => {}); }
  });
  it("concurrent parent delete settles before parent check", async () => {
    const t = await thread(); const parent = (await (await reply(req({ content: "parent" }), ctx(t.id))).json()).data;
    const writer = await pool.connect(); let pending: ReturnType<typeof reply> | undefined;
    try {
      await writer.query("BEGIN"); await writer.query('DELETE FROM forum_posts WHERE id=$1', [parent.id]);
      pending = reply(req({ content: "child", parentId: parent.id }), ctx(t.id)); await blocked("FOR KEY SHARE"); await writer.query("COMMIT");
      expect((await pending).status).toBe(400);
    } finally { await writer.query("ROLLBACK"); writer.release(); if (pending) await pending.catch(() => {}); }
  });
  it("DB notification failure rolls back content AND earlier recipient notifications; successful retry emits one event", async () => {
    const t = await thread(); await followThread(t.id);
    // Force failure on the second recipient insert to prove partial persistence rolls back.
    await pool.query(`CREATE FUNCTION forums_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."userId" = '${c}' THEN RAISE EXCEPTION 'fixture notification failure'; END IF; RETURN NEW; END $$`);
    await pool.query('CREATE TRIGGER forums_test_fail BEFORE INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION forums_test_fail()');
    try {
      await expect(reply(req({ content: "rollback" }, keys[1]), ctx(t.id))).rejects.toThrow();
      await expect(create(req(threadBody({ title: "Rollback thread" })))).rejects.toThrow();
      expect(await db.forumPost.count({ where: { threadId: t.id } })).toBe(0);
      expect(await db.forumThread.count({ where: { categoryId } })).toBe(1);
      expect(await notifications("FORUM_REPLY")).toHaveLength(0);
      expect(await notifications("NEW_FORUM_THREAD")).toHaveLength(2);
      expect(sendNotificationEmail).not.toHaveBeenCalled(); expect(sendAPNSNotification).not.toHaveBeenCalled();
    } finally { await pool.query('DROP TRIGGER forums_test_fail ON notifications'); await pool.query('DROP FUNCTION forums_test_fail()'); }
    expect((await reply(req({ content: "retry" }, keys[1]), ctx(t.id))).status).toBe(201);
    expect(await notifications("FORUM_REPLY")).toHaveLength(2);
  });
  it("enabled transport preferences run only after commit; delivery failure never re-dispatches event or fails saved content", async () => {
    const t = await thread(); await followThread(t.id);
    await db.user.update({ where: { id: c }, data: { email: `${prefix}@example.invalid` } });
    await db.notificationPreference.create({ data: { userId: c, type: "FORUM_REPLIES", inApp: true, email: true } });
    await db.pushDevice.create({ data: { userId: c, platform: "ios", token: prefix } });
    vi.mocked(sendAPNSNotification).mockImplementation(async () => {
      expect(await db.forumPost.count({ where: { threadId: t.id } })).toBe(1);
      expect(await notifications("FORUM_REPLY")).toHaveLength(2);
      throw new Error("fixture APNS failure");
    });
    vi.mocked(sendNotificationEmail).mockRejectedValue(new Error("fixture email failure"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect((await reply(req({ content: "committed" }, keys[1]), ctx(t.id))).status).toBe(201);
      expect(sendAPNSNotification).toHaveBeenCalledTimes(1); expect(sendNotificationEmail).toHaveBeenCalledTimes(1);
      expect(log).toHaveBeenCalledTimes(2); expect(await notifications("FORUM_REPLY")).toHaveLength(2);
    } finally {
      await db.pushDevice.deleteMany({ where: { userId: c } }); await db.notificationPreference.deleteMany({ where: { userId: c } }); await db.user.update({ where: { id: c }, data: { email: null } });
    }
  });
});
