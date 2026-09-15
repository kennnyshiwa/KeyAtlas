import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID, createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { NextRequest } from "next/server";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";

const database = process.env.DISCOVERY_DATABASE_URL;
describe.skipIf(!database)("discovery production routes + real auth/PostgreSQL", () => {
  let db: PrismaClient;
  let list: typeof import("../../projects/route").GET;
  let recommended: typeof import("./route").GET;
  const run = `discovery-${randomUUID()}`;
  const alice = `${run}-alice`, bob = `${run}-bob`;
  const keys = { alice: `kv_${run}-alice`, bob: `kv_${run}-bob` };
  const now = new Date(), day = 86400000;
  const ago = (days: number) => new Date(now.getTime() - days * day);
  async function project(name: string, overrides: Partial<Prisma.ProjectUncheckedCreateInput> = {}) {
    return db.project.create({ data: { id: `${run}-${name}`, slug: `${run}-${name}`, title: name, creatorId: alice,
      category: "KEYCAPS", status: "GROUP_BUY", published: true, profiles: ["Cherry"], profile: "Cherry", tags: [],
      createdAt: ago(20), updatedAt: ago(2), ...overrides } });
  }
  async function follow(userId: string, id: string, days = 0, linked = true) {
    await db.follow.create({ data: { userId, targetType: "PROJECT", targetId: id, targetProjectId: linked ? id : null, createdAt: ago(days) } });
  }
  function request(path: string, who?: keyof typeof keys) {
    return new NextRequest(`http://localhost/api/v1/${path}`, { headers: who ? { Authorization: `Bearer ${keys[who]}` } : {} });
  }
  async function rec(who: keyof typeof keys = "alice") {
    const res = await recommended(request("discover/recommended", who)); expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store"); return res.json();
  }
  beforeAll(async () => {
    const url = new URL(database!);
    if (url.hostname !== "127.0.0.1" || !/^\/discovery_[a-z0-9_]+$/.test(url.pathname)) throw new Error("Requires disposable loopback discovery_* DB");
    vi.stubEnv("DATABASE_URL", database!); vi.stubEnv("REDIS_URL", "");
    ({ prisma: db } = await import("@/lib/prisma")); ({ GET: list } = await import("../../projects/route")); ({ GET: recommended } = await import("./route"));
    await db.user.createMany({ data: [{ id: alice }, { id: bob }] });
    for (const who of ["alice", "bob"] as const) await db.apiKey.create({ data: { userId: who === "alice" ? alice : bob, name: run, key: createHash("sha256").update(keys[who]).digest("hex"), prefix: "kv_fixture" } });
  });
  beforeEach(async () => {
    await db.follow.deleteMany({ where: { userId: { in: [alice, bob] } } });
    await db.project.deleteMany({ where: { creatorId: alice } });
  });
  afterAll(async () => {
    if (db) { await db.user.deleteMany({ where: { id: { in: [alice, bob] } } }); await db.$disconnect(); }
    vi.unstubAllEnvs();
  });
  it("isolates two real API-key viewers and anonymous list flags on repeated identical URLs", async () => {
    const a = await project("a"), b = await project("b");
    await follow(alice, a.id, 0, false); await follow(bob, b.id);
    await db.favorite.create({ data: { userId: alice, projectId: b.id } });
    await db.userCollection.create({ data: { userId: bob, projectId: a.id } });
    for (const who of ["alice", "bob", undefined, "alice", undefined] as const) {
      const res = await list(request("projects?page_size=1&sort=a-z", who)); const body = await res.json();
      expect(res.headers.get("cache-control")).toBe("private, no-store"); expect(res.headers.get("vary")).toBe("Authorization, Cookie");
      expect(body.data).toHaveLength(1); expect(body.data[0]).toMatchObject({ id: a.id, is_following: who === "alice", is_favorited: false, is_in_collection: who === "bob", follow_count: 1 });
      const page2 = await (await list(request("projects?page_size=1&page=2&sort=a-z", who))).json();
      expect(page2.data[0]).toMatchObject({ id: b.id, is_following: who === "bob", is_favorited: who === "alice", is_in_collection: false });
    }
  });
  it("uses the latest FOLLOW of an old published anchor outside newest50 and excludes ALL follows", async () => {
    const anchor = await project("old anchor", { createdAt: ago(200), updatedAt: ago(150) });
    const olderFollow = await project("older follow", { category: "SWITCHES", createdAt: ago(1) });
    await follow(alice, anchor.id, 1); await follow(alice, olderFollow.id, 2);
    for (let i = 0; i < 55; i++) await project(`new-${i}`, { createdAt: ago(1), updatedAt: new Date(now.getTime() - i * 1000) });
    await follow(alice, `${run}-new-0`, 3, false); // legacy targetId must still be excluded
    const listBody = await (await list(request("projects?page_size=60", "alice"))).json();
    expect(listBody.data).toHaveLength(50); expect(listBody.data.map((p: { id: string }) => p.id)).not.toContain(anchor.id);
    const body = await rec(); expect(body.anchor_title).toBe("old anchor"); expect(body.data).toHaveLength(10);
    expect(body.data.map((p: { title: string }) => p.title)).toEqual(Array.from({ length: 10 }, (_, i) => `new-${i + 1}`));
    expect(await rec("bob")).toEqual({ anchor_title: null, data: [] });
    expect((await recommended(request("discover/recommended"))).status).toBe(401);
    expect((await rec()).anchor_title).toBe("old anchor");
    if (process.env.DISCOVERY_CONTRACT_OUTPUT) await writeFile(process.env.DISCOVERY_CONTRACT_OUTPUT, JSON.stringify(body));
  });
  it("keeps unpublished sources/candidates private and respects category/90-day/score/tie policy", async () => {
    const anchor = await project("public anchor", { updatedAt: ago(150) }); await follow(alice, anchor.id, 2);
    const hidden = await project("secret anchor", { published: false }); await follow(alice, hidden.id, 0);
    await project("hidden candidate", { published: false }); await project("outside window", { updatedAt: ago(91) });
    await project("wrong category", { category: "SWITCHES" });
    await project("newer mismatch", { profiles: ["KAT"], profile: "KAT", updatedAt: ago(1) });
    await project("matching newer", { updatedAt: ago(2) }); await project("matching older", { updatedAt: ago(3) });
    await project("inside window", { updatedAt: ago(89) });
    const body = await rec(); expect(body.anchor_title).toBe("public anchor");
    expect(body.data.map((p: { title: string }) => p.title)).toEqual(["matching newer", "matching older", "inside window", "newer mismatch"]);
    expect(JSON.stringify(body)).not.toContain("secret");
    await db.project.update({ where: { id: anchor.id }, data: { published: false } });
    expect(await rec()).toEqual({ anchor_title: null, data: [] });
  });
  it("takes the website newest48 pool before category filtering and includes engagement inputs", async () => {
    const anchor = await project("anchor", { updatedAt: ago(150) }); await follow(alice, anchor.id);
    for (let i = 0; i < 48; i++) await project(`other-${i}`, { category: "SWITCHES", updatedAt: ago(1) });
    await project("outside pool", { updatedAt: ago(2) });
    expect((await rec()).data).toEqual([]);
    await db.project.deleteMany({ where: { creatorId: alice, category: "SWITCHES" } });
    const engaged = await project("engaged", { updatedAt: ago(3) });
    await db.favorite.create({ data: { userId: alice, projectId: engaged.id } });
    await db.userCollection.create({ data: { userId: alice, projectId: engaged.id } });
    await follow(bob, engaged.id);
    const body = await rec();
    expect(body.data[0]).toMatchObject({ id: engaged.id, is_following: false, is_favorited: true, is_in_collection: true, favorite_count: 1, follow_count: 1 });
  });
  it("authenticates keys, not ambient cookies; rejects invalid, revoked and expired keys", async () => {
    for (const headers of [{ Cookie: "session=fixture" }, { Authorization: "Bearer invalid" }] as Record<string, string>[]) {
      expect((await recommended(new NextRequest("http://localhost/api/v1/discover/recommended", { headers }))).status).toBe(401);
    }
    const key = createHash("sha256").update(keys.bob).digest("hex");
    await db.apiKey.update({ where: { key }, data: { revoked: true } }); expect((await recommended(request("discover/recommended", "bob"))).status).toBe(401);
    await db.apiKey.update({ where: { key }, data: { revoked: false, expiresAt: ago(1) } }); expect((await recommended(request("discover/recommended", "bob"))).status).toBe(401);
    await db.apiKey.update({ where: { key }, data: { expiresAt: null } });
  });
});
