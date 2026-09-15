import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { NextRequest } from "next/server";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { HEARTBREAKER_SLUG_REPAIR as repair } from "@/lib/project-slug-aliases";

// No query/selector/serializer doubles: exercise GET against actual PostgreSQL.
// Never inherit ambient DATABASE_URL or enable on a non-loopback database.
const database = process.env.RELATED_PROJECTS_DATABASE_URL;
describe.skipIf(!database)("related GET / real PostgreSQL", () => {
  let db: PrismaClient;
  let get: typeof import("./route").GET;
  const run = `related-${randomUUID()}`;
  const owner = `${run}-owner`, follower = `${run}-follower`, vendor = `${run}-vendor`, designer = `${run}-designer`;
  const date = new Date("2026-09-01T12:34:56.000Z");
  let source: Awaited<ReturnType<typeof project>>;
  async function project(name: string, overrides: Partial<Prisma.ProjectUncheckedCreateInput> = {}) {
    return db.project.create({ data: {
      id: `${run}-${name}`, slug: `${run}-${name}`, title: name, creatorId: owner,
      category: "KEYCAPS", status: "GROUP_BUY", published: true, tags: [],
      createdAt: date, updatedAt: date, ...overrides,
    } });
  }
  async function response(slug = source.slug) {
    return get(new NextRequest(`http://localhost/api/v1/projects/${encodeURIComponent(slug)}/related`), { params: Promise.resolve({ slug }) });
  }
  async function data(slug = source.slug) {
    const res = await response(slug); expect(res.status).toBe(200);
    return (await res.json()).data as Array<Record<string, unknown>>;
  }
  beforeAll(async () => {
    const url = new URL(database!);
    if (url.hostname !== "127.0.0.1" || !/^\/related_projects_[a-z0-9_]+$/.test(url.pathname)) {
      throw new Error("Requires an explicitly supplied loopback related_projects_* disposable DB");
    }
    vi.stubEnv("DATABASE_URL", database!); vi.stubEnv("REDIS_URL", "");
    ({ prisma: db } = await import("@/lib/prisma")); ({ GET: get } = await import("./route"));
    await db.user.createMany({ data: [
      { id: owner, username: "related_owner", name: "Creator", displayName: "Public creator", image: "https://example.invalid/avatar.png", email: "private@example.invalid", passwordHash: "private" },
      { id: follower },
    ] });
    await db.vendor.create({ data: { id: vendor, name: "Fixture vendor", slug: vendor, logo: "https://example.invalid/logo.png" } });
    await db.designer.create({ data: { id: designer, name: "Fixture designer", slug: designer } });
  });
  beforeEach(async () => {
    await db.follow.deleteMany({ where: { userId: { in: [owner, follower] } } });
    await db.project.deleteMany({ where: { creatorId: owner } });
    source = await project("source", { vendorId: vendor, featured: true });
  });
  afterAll(async () => {
    if (db) {
      await db.user.deleteMany({ where: { id: { in: [owner, follower] } } });
      await db.vendor.deleteMany({ where: { id: vendor } });
      await db.designer.deleteMany({ where: { id: designer } });
      await db.$disconnect();
    }
    vi.unstubAllEnvs();
  });
  it("selects category OR non-null vendor, excludes source and unrelated/hidden candidates", async () => {
    const category = await project("category");
    const sameVendor = await project("vendor", { vendorId: vendor, category: "SWITCHES" });
    await project("unrelated", { category: "KEYBOARDS" });
    await project("hidden", { vendorId: vendor, published: false, featured: true });
    const ids = (await data()).map(p => p.id);
    expect(ids.sort()).toEqual([category.id, sameVendor.id].sort()); expect(ids).not.toContain(source.id);
  });
  it("null vendor relates only the category, never all vendor-less projects", async () => {
    source = await db.project.update({ where: { id: source.id }, data: { vendorId: null } });
    const category = await project("category", { vendorId: vendor });
    await project("null-vendor-other-category", { category: "SWITCHES" });
    expect((await data()).map(p => p.id)).toEqual([category.id]);
  });
  it("orders featured first then updatedAt descending and caps at four even with query overrides", async () => {
    for (let i = 0; i < 6; i++) await project(`card-${i}`, {
      featured: i === 0 || i === 2, updatedAt: new Date(date.getTime() + i * 1000),
    });
    const res = await get(new NextRequest("http://localhost/api/v1/projects/source/related?limit=50&published=false&sort=oldest"), { params: Promise.resolve({ slug: source.slug }) });
    expect((await res.json()).data.map((p: { title: string }) => p.title)).toEqual(["card-2", "card-0", "card-5", "card-4"]);
  });
  it.each(["missing", "hidden"])("returns JSON 404 for %s source, regardless of related candidates", async (kind) => {
    await project("candidate");
    if (kind === "hidden") await db.project.update({ where: { id: source.id }, data: { published: false } });
    const res = await response(kind === "missing" ? `${run}-missing` : source.slug);
    expect(res.status).toBe(404); expect(await res.json()).toEqual({ error: "Not found" });
  });
  it("returns exactly an empty data array when a published source has no matches", async () => {
    expect(await (await response()).json()).toEqual({ data: [] });
  });
  it("resolves Unicode NFC/NFD and percent-encoded aliases without broad slug matching", async () => {
    source = await db.project.update({ where: { id: source.id }, data: { slug: `${run}-caf\u00e9` } });
    const candidate = await project("candidate");
    for (const slug of [source.slug, source.slug.normalize("NFD"), encodeURIComponent(source.slug), encodeURIComponent(source.slug.normalize("NFD"))]) {
      expect((await data(slug)).map(p => p.id)).toEqual([candidate.id]);
    }
    expect((await response(`${run}-cafe`)).status).toBe(404);
    expect((await response("%E0%A4%A")).status).toBe(404);
  });
  it("resolves both reserved names by immutable ID, excluding that ID even across slug collisions", async () => {
    source = await db.project.update({ where: { id: source.id }, data: { id: repair.id, slug: `${run}-canonical` } });
    // A hidden collision must not shadow the reserved identity.
    await project("collision", { slug: repair.oldSlug, published: false });
    const candidate = await project("candidate");
    for (const slug of [repair.oldSlug, repair.newSlug, encodeURIComponent(repair.oldSlug)]) {
      expect((await data(slug)).map(p => p.id)).toEqual([candidate.id]);
    }
    await db.project.update({ where: { id: repair.id }, data: { published: false } });
    expect((await response(repair.oldSlug)).status).toBe(404);
    await db.project.delete({ where: { id: repair.id } });
    // A published slug collision must not be a fallback when the identity is absent.
    await db.project.update({ where: { id: `${run}-collision` }, data: { published: true } });
    expect((await response(repair.oldSlug)).status).toBe(404);
    expect((await response(repair.newSlug)).status).toBe(404);
  });
  it("serializes exact native card fields with truthful polymorphic follows, favorites and all comments", async () => {
    const p = await project("Contract card", {
      description: "Fixture description", heroImage: "https://example.invalid/hero.png", designerId: designer,
      priceMin: 12900, priceMax: 14900, currency: "USD", profile: "Cherry", profiles: [" Cherry ", "KAT"], tags: ["fixture"],
      estimatedDelivery: "Q1 2027", gbStartDate: date, gbEndDate: new Date("2026-10-01T00:00:00.000Z"), featured: true,
      images: { create: [
        { id: `${run}-image-2`, url: "https://example.invalid/2.png", alt: null, order: 1 },
        { id: `${run}-image-1`, url: "https://example.invalid/1.png", alt: "Front", order: 0 },
      ] },
      projectVendors: { create: { vendorId: vendor, storeLink: "https://example.invalid/store", region: "US" } },
      favorites: { create: [{ userId: owner }, { userId: follower }] },
      comments: { create: { id: `${run}-comment`, content: "parent", userId: owner } },
    });
    await db.comment.create({ data: { projectId: p.id, parentId: `${run}-comment`, content: "reply", userId: follower } });
    await db.follow.createMany({ data: [
      { userId: owner, targetType: "PROJECT", targetId: p.id }, // legacy null targetProjectId
      { userId: follower, targetType: "PROJECT", targetId: p.id, targetProjectId: p.id },
      { userId: owner, targetType: "VENDOR", targetId: p.id }, // must not inflate count
      { userId: follower, targetType: "PROJECT", targetId: source.id },
    ] });
    const nullable = await project("Nullable card", { status: "COMPLETED" });
    const res = await response(); expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    const wire = await res.text(); const body = JSON.parse(wire);
    expect(Object.keys(body)).toEqual(["data"]);
    expect(body.data[0]).toEqual({
      id: p.id, title: p.title, slug: p.slug, description: "Fixture description", status: "GROUP_BUY",
      hero_image_url: "https://example.invalid/hero.png", category: "KEYCAPS", category_id: "KEYCAPS",
      profile: "Cherry", profiles: ["Cherry", "KAT"],
      designer: { id: owner, username: "related_owner", name: "Creator", displayName: "Public creator", avatar_url: "https://example.invalid/avatar.png", image: "https://example.invalid/avatar.png", role: "USER" },
      designer_profile: { name: "Fixture designer", slug: designer },
      pricing: { min_price: 12900, max_price: 14900, currency: "USD" },
      vendors: [{ id: `${p.id}-${vendor}`, vendor: { id: vendor, name: "Fixture vendor", slug: vendor, logo_url: "https://example.invalid/logo.png" }, url: "https://example.invalid/store", region: "US" }],
      gallery: [
        { id: `${run}-image-1`, url: "https://example.invalid/1.png", caption: "Front", position: 0 },
        { id: `${run}-image-2`, url: "https://example.invalid/2.png", caption: null, position: 1 },
      ],
      tags: ["fixture"], estimated_delivery: "Q1 2027", gb_start_date: date.toISOString(), gb_end_date: "2026-10-01T00:00:00.000Z",
      follow_count: 2, favorite_count: 2, comment_count: 2,
      is_following: false, is_favorited: false, is_in_collection: false, is_featured: true, published: true,
      created_at: date.toISOString(), updated_at: date.toISOString(),
    });
    expect(body.data[1]).toMatchObject({ id: nullable.id, status: "COMPLETED", hero_image_url: null, designer_profile: null,
      pricing: { min_price: null, max_price: null, currency: "USD" }, gallery: [], vendors: [],
      follow_count: 0, favorite_count: 0, comment_count: 0, gb_start_date: null, gb_end_date: null, estimated_delivery: null,
    });
    expect(wire).not.toContain("private"); expect(wire).not.toContain("passwordHash"); expect(wire).not.toContain("creatorId");
    // This exact production NextResponse (not a hand-authored JSON fixture) feeds Swift.
    if (process.env.RELATED_PROJECTS_CONTRACT_OUTPUT) await writeFile(process.env.RELATED_PROJECTS_CONTRACT_OUTPUT, wire);
  });
});
