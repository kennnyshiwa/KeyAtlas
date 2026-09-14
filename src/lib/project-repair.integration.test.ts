import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { NextRequest } from "next/server";
vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => null) }));
vi.mock("@/lib/api-auth", () => ({ authenticateApiKey: vi.fn(async () => null) }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn(async () => null), RATE_LIMIT_DETAIL: {}, RATE_LIMIT_PROJECT_UPDATE: {}, RATE_LIMIT_FOLLOW: {}, RATE_LIMIT_LIST: {}, RATE_LIMIT_COMMENT_CREATE: {} }));
vi.mock("@/lib/meilisearch", () => ({ indexProject: vi.fn(), removeProjectFromIndex: vi.fn() }));
vi.mock("@/lib/notifications/watchlist", () => ({ notifyWatchlistMatches: vi.fn() }));
import { auth } from "@/lib/auth";
import { authenticateApiKey } from "@/lib/api-auth";
import type { PrismaClient } from "@/generated/prisma/client";
import { HEARTBREAKER_SLUG_REPAIR as repair, projectSlugWhere } from "./project-slug-aliases";

// Opt-in ONLY against a disposable local DB initialized from prisma/schema.prisma.
const databaseUrl = process.env.KEYATLAS_TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)("PostgreSQL draft deletion and exact slug repair", () => {
  let prisma: PrismaClient;
  let pool: Pool;
  let deleteProjectRecord: typeof import("./project-delete").deleteProjectRecord;
  const ownerId = `builder-${randomUUID()}`;
  const otherId = `builder-${randomUUID()}`;
  const fixtureIds: string[] = [];
  const vendorIds: string[] = [];

  beforeAll(async () => {
    const url = new URL(databaseUrl!);
    if (url.hostname !== "127.0.0.1" || !url.pathname.endsWith("_qa")) throw new Error("Disposable local *_qa database required");
    vi.stubEnv("DATABASE_URL", databaseUrl!);
    ({ prisma } = await import("./prisma"));
    ({ deleteProjectRecord } = await import("./project-delete"));
    pool = new Pool({ connectionString: databaseUrl });
    await prisma.user.createMany({ data: [{ id: ownerId }, { id: otherId }] });
  });
  afterAll(async () => {
    if (!prisma) return;
    await prisma.project.deleteMany({ where: { id: { in: fixtureIds }, creatorId: { in: [ownerId, otherId] } } });
    await prisma.follow.deleteMany({ where: { userId: ownerId } });
    await prisma.watchlistNotification.deleteMany({ where: { userId: ownerId } });
    await prisma.vendor.deleteMany({ where: { id: { in: vendorIds } } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, otherId] } } });
    await prisma.$disconnect(); await pool.end(); vi.unstubAllEnvs();
  });
  async function draft() {
    const id = `draft-${randomUUID()}`; fixtureIds.push(id);
    const project = await prisma.project.create({ data: {
      id, title: "Disposable builder fixture", slug: id, category: "KEYCAPS", creatorId: ownerId, tags: [],
      images: { create: { url: "https://example.test/fixture.png" } },
      links: { create: { label: "Source", url: "https://example.test/fixture" } },
      comments: { create: { id: `comment-${id}`, content: "parent", userId: ownerId } },
      favorites: { create: { userId: ownerId } },
      collection: { create: { userId: ownerId } },
      updates: { create: { title: "Update", content: "fixture" } },
      soundTests: { create: { url: "https://example.test/sound" } },
      reports: { create: { reason: "fixture", reporterId: ownerId } },
      referralClicks: { create: { ref: "fixture" } },
      changeLogs: { create: { field: "title", summary: "fixture", actorId: ownerId } },
    } });
    await prisma.comment.create({ data: { projectId: id, parentId: `comment-${id}`, content: "reply", userId: ownerId } });
    await prisma.follow.create({ data: { userId: ownerId, targetType: "PROJECT", targetId: id } });
    const filter = await prisma.savedFilter.create({ data: { name: "fixture", criteria: {}, userId: ownerId } });
    await prisma.watchlistNotification.create({ data: { savedFilterId: filter.id, projectId: id, userId: ownerId } });
    return project;
  }
  async function waitForBlockedDelete() {
    const deadline = Date.now() + 4000;
    while (Date.now() < deadline) {
      const blocked = await pool.query("SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%DELETE%projects%'");
      if (blocked.rowCount) return;
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
    throw new Error("Expected DELETE to wait on the concurrent row lock");
  }
  it("really cascades child rows/replies and cleans non-FK follows/watchlist entries", async () => {
    const project = await draft();
    expect(await deleteProjectRecord(project.id, { unpublishedOnly: true, creatorId: ownerId })).toBe(true);
    const counts = await Promise.all([
      prisma.project.count({ where: { id: project.id } }),
      prisma.projectImage.count({ where: { projectId: project.id } }), prisma.projectLink.count({ where: { projectId: project.id } }),
      prisma.comment.count({ where: { projectId: project.id } }), prisma.favorite.count({ where: { projectId: project.id } }),
      prisma.userCollection.count({ where: { projectId: project.id } }), prisma.projectUpdate.count({ where: { projectId: project.id } }),
      prisma.soundTest.count({ where: { projectId: project.id } }), prisma.projectReport.count({ where: { projectId: project.id } }),
      prisma.referralClick.count({ where: { projectId: project.id } }), prisma.projectChangeLog.count({ where: { projectId: project.id } }),
      prisma.follow.count({ where: { targetType: "PROJECT", targetId: project.id } }), prisma.watchlistNotification.count({ where: { projectId: project.id } }),
    ]);
    expect(counts).toEqual(Array(13).fill(0));
  });
  it.each(["publish", "transfer"])("rechecks the guard after a concurrent %s wins the row lock", async (action) => {
    const project = await draft(); const writer = await pool.connect();
    let deletion: Promise<boolean> | undefined;
    try {
      await writer.query("BEGIN");
      if (action === "publish") await writer.query('UPDATE projects SET published = true WHERE id = $1', [project.id]);
      else await writer.query('UPDATE projects SET "creatorId" = $1 WHERE id = $2', [otherId, project.id]);
      deletion = deleteProjectRecord(project.id, { unpublishedOnly: true, creatorId: ownerId });
      await waitForBlockedDelete(); await writer.query("COMMIT");
      expect(await deletion).toBe(false);
      expect(await prisma.project.findUnique({ where: { id: project.id } })).not.toBeNull();
      expect(await prisma.comment.count({ where: { projectId: project.id } })).toBe(2);
      expect(await prisma.follow.count({ where: { targetId: project.id } })).toBe(1);
    } finally { await writer.query("ROLLBACK"); writer.release(); if (deletion) await deletion.catch(() => {}); }
  });
  it("rolls back cascades and legacy cleanup if a dependent cleanup fails", async () => {
    const project = await draft();
    // Fault injection is confined to this disposable local DB.
    await pool.query(`CREATE FUNCTION builder_fail_cleanup() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture cleanup failure'; END $$;
      CREATE TRIGGER builder_fail_cleanup BEFORE DELETE ON watchlist_notifications FOR EACH ROW EXECUTE FUNCTION builder_fail_cleanup()`);
    try {
      await expect(deleteProjectRecord(project.id, { unpublishedOnly: true, creatorId: ownerId })).rejects.toThrow();
      expect(await prisma.project.findUnique({ where: { id: project.id } })).not.toBeNull();
      expect(await prisma.comment.count({ where: { projectId: project.id } })).toBe(2);
      expect(await prisma.follow.count({ where: { targetId: project.id } })).toBe(1);
    } finally { await pool.query("DROP TRIGGER builder_fail_cleanup ON watchlist_notifications; DROP FUNCTION builder_fail_cleanup()"); }
  });
  describe("reviewed snapshot repair", () => {
    let forward: string;
    let rollback: string;
    let snapshotSql: string;
    beforeAll(async () => {
      forward = await readFile("scripts/repairs/20260914-heartbreaker-slug.sql", "utf8");
      rollback = await readFile("scripts/repairs/20260914-heartbreaker-slug-rollback.sql", "utf8");
      snapshotSql = await readFile("scripts/repairs/20260914-heartbreaker-snapshot.sql", "utf8");
      // Reconcile the known production-only nullable field, local disposable DB only.
      await pool.query('ALTER TABLE projects ADD COLUMN IF NOT EXISTS "estimatedDelivery_new" text');
    });
    afterEach(async () => {
      vi.mocked(authenticateApiKey).mockResolvedValue(null);
      await prisma.follow.deleteMany({ where: { userId: ownerId, targetId: repair.id } });
      await prisma.watchlistNotification.deleteMany({ where: { userId: ownerId, projectId: repair.id } });
      await prisma.project.deleteMany({ where: { id: repair.id, creatorId: ownerId } });
    });
    const snapshot = async () => (await pool.query(snapshotSql)).rows[0].expected_snapshot;
    async function fixture(direction = "forward") {
      const p = await draft();
      await prisma.project.update({ where: { id: p.id }, data: { id: repair.id, title: repair.title, slug: direction === "forward" ? repair.oldSlug : repair.newSlug, status: repair.status, published: true } });
      fixtureIds.push(repair.id);
      await prisma.follow.updateMany({ where: { targetId: p.id }, data: { targetId: repair.id, targetProjectId: repair.id } });
      await prisma.watchlistNotification.updateMany({ where: { projectId: p.id }, data: { projectId: repair.id } });
      await pool.query('UPDATE projects SET "estimatedDelivery_new" = $1 WHERE id = $2', ["live-only sentinel", repair.id]);
      await prisma.projectLink.createMany({ data: [
        { id: `z-${randomUUID()}`, projectId: repair.id, label: "Second source", url: "https://example.test/two", sortOrder: 1 },
        { id: `a-${randomUUID()}`, projectId: repair.id, label: "Tie source", url: "https://example.test/three", sortOrder: 0 },
      ] });
      // Include relations omitted by the old test, plus SET NULL FK and legacy references.
      const vendor = await prisma.vendor.create({ data: { name: "Repair fixture", slug: `vendor-${randomUUID()}`, projectVendors: { create: { projectId: repair.id } } } });
      vendorIds.push(vendor.id);
      await prisma.vendorSuggestion.create({ data: { name: "Fixture", normalizedName: "fixture", website: "https://example.test", submittedById: ownerId, projectId: repair.id } });
      return snapshot();
    }
    async function execute(sql: string, expected: unknown, ending = "COMMIT;") {
      const client = await pool.connect();
      try {
        await client.query("SELECT set_config('keyatlas.heartbreaker_expected', $1, false)", [expected === undefined ? "" : JSON.stringify(expected)]);
        const results = await client.query(sql.replace(/ROLLBACK;\s*$/, ending));
        const receipt = (Array.isArray(results) ? results : [results]).flatMap((r) => r.rows).find((r) => r.receipt)?.receipt;
        return receipt;
      } finally { await client.query("ROLLBACK"); client.release(); }
    }
    it("default dry runs and committed forward/rollback emit exactly one row and preserve full row, ordered sources and all relations", async () => {
      const before = await fixture();
      const dry = await execute(forward, before, "ROLLBACK;");
      expect(dry.affected_rows).toBe(1);
      expect(await snapshot()).toEqual(before);
      const applied = await execute(forward, before);
      const after = await snapshot();
      expect(applied.after).toEqual(after);
      expect(after).toEqual({ ...before, project: { ...before.project, slug: repair.newSlug } });
      expect(applied.relations_after).toEqual(applied.relations_before);
      expect(Object.keys(applied.relations_before).length).toBeGreaterThanOrEqual(15);
      expect(applied.affected_rows).toBe(1);
      await execute(rollback, applied.after, "ROLLBACK;");
      expect(await snapshot()).toEqual(after);
      const reverted = await execute(rollback, applied.after);
      expect(reverted.affected_rows).toBe(1);
      expect(reverted.relations_after).toEqual(applied.relations_before);
      expect(await snapshot()).toEqual(before);
    });
    describe.each(["forward", "rollback"])("%s guards", (direction) => {
      const script = () => direction === "forward" ? forward : rollback;
      it.each(["missing", "partial", "timestamp", "description", "live-only", "source-url", "source-order", "source-insert", "source-delete", "wrong-direction"])("rejects %s evidence without slug mutation", async (change) => {
        let expected = await fixture(direction);
        if (change === "missing") expected = undefined;
        if (change === "partial") delete expected.project.estimatedDelivery_new;
        if (change === "timestamp") await pool.query('UPDATE projects SET "updatedAt" = "updatedAt" + interval \'1 second\' WHERE id = $1', [repair.id]);
        if (change === "description") await pool.query('UPDATE projects SET description = $1 WHERE id = $2', ["editorial change", repair.id]);
        if (change === "live-only") await pool.query('UPDATE projects SET "estimatedDelivery_new" = $1 WHERE id = $2', ["drift changed", repair.id]);
        if (change === "source-url") await pool.query('UPDATE project_links SET url = $1 WHERE "projectId" = $2', ["https://example.test/changed", repair.id]);
        if (change === "source-order") expected.sources.reverse();
        if (change === "source-insert") await prisma.projectLink.create({ data: { projectId: repair.id, label: "New", url: "https://example.test/new" } });
        if (change === "source-delete") await prisma.projectLink.deleteMany({ where: { projectId: repair.id } });
        if (change === "wrong-direction") expected.project.slug = direction === "forward" ? repair.newSlug : repair.oldSlug;
        const unchanged = await snapshot();
        await expect(execute(script(), expected)).rejects.toThrow(/snapshot (required|changed)/);
        expect(await snapshot()).toEqual(unchanged);
      });
      it.each(["zero-row", "row-content", "source-content", "relation-delete"])("aborts and rolls back unexpected trigger behavior: %s", async (fault) => {
        const expected = await fixture(direction);
        const favorites = await prisma.favorite.findMany({ where: { projectId: repair.id } });
        const body = fault === "zero-row" ? "RETURN NULL;"
          : fault === "row-content" ? "NEW.description := 'unexpected'; RETURN NEW;"
          : fault === "source-content" ? `UPDATE project_links SET url = 'https://example.test/trigger' WHERE "projectId" = NEW.id; RETURN NEW;`
          : `DELETE FROM favorites WHERE "projectId" = NEW.id; RETURN NEW;`;
        await pool.query(`CREATE FUNCTION builder_rework_invariant() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN ${body} END $$;
          CREATE TRIGGER builder_rework_invariant BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION builder_rework_invariant()`);
        try {
          await expect(execute(script(), expected)).rejects.toThrow(/Expected exactly one|Slug-only invariant|Relation\/source preservation/);
          expect(await snapshot()).toEqual(expected);
          expect(await prisma.favorite.findMany({ where: { projectId: repair.id } })).toEqual(favorites);
        } finally { await pool.query("DROP TRIGGER builder_rework_invariant ON projects; DROP FUNCTION builder_rework_invariant()"); }
      });
      it("rejects an unpublished collision", async () => {
        const expected = await fixture(direction);
        const collision = await draft();
        await prisma.project.update({ where: { id: collision.id }, data: { slug: direction === "forward" ? repair.newSlug : repair.oldSlug } });
        try { await expect(execute(script(), expected)).rejects.toThrow("collides"); }
        finally { await prisma.project.delete({ where: { id: collision.id } }); }
        expect(await snapshot()).toEqual(expected);
      });
      it("rejects a source writer that commits while repair waits for its lock", async () => {
        const expected = await fixture(direction);
        const writer = await pool.connect();
        let running: Promise<unknown> | undefined;
        try {
          await writer.query("BEGIN");
          await writer.query('UPDATE project_links SET url = $1 WHERE "projectId" = $2', ["https://example.test/racing", repair.id]);
          running = execute(script(), expected);
          // Attach rejection before releasing writer, avoiding unhandled rejection noise.
          const rejected = expect(running).rejects.toThrow("snapshot changed");
          await waitForLock("LOCK TABLE project_links");
          await writer.query("COMMIT");
          await rejected;
          expect((await snapshot()).project).toEqual(expected.project);
        } finally { await writer.query("ROLLBACK"); writer.release(); await running?.catch(() => {}); }
      });
      it.each(["UPDATE", "INSERT", "DELETE"])("excludes concurrent source %s for the whole repair transaction", async (operation) => {
        const expected = await fixture(direction);
        const repairClient = await pool.connect(); const writer = await pool.connect();
        try {
          await repairClient.query("SELECT set_config('keyatlas.heartbreaker_expected', $1, false)", [JSON.stringify(expected)]);
          await repairClient.query(script().replace(/ROLLBACK;\s*$/, ""));
          await writer.query("BEGIN; SET LOCAL lock_timeout = '200ms'");
          const sql = operation === "UPDATE" ? 'UPDATE project_links SET url = \'https://example.test/blocked\' WHERE "projectId" = $1'
            : operation === "DELETE" ? 'DELETE FROM project_links WHERE "projectId" = $1'
            : 'INSERT INTO project_links (id, label, url, "projectId") VALUES (\'blocked-link\', \'Blocked\', \'https://example.test/blocked\', $1)';
          await expect(writer.query(sql, [repair.id])).rejects.toThrow("lock timeout");
        } finally { await writer.query("ROLLBACK"); await repairClient.query("ROLLBACK"); writer.release(); repairClient.release(); }
        expect(await snapshot()).toEqual(expected);
      });
    });
    async function waitForLock(query: string) {
      const deadline = Date.now() + 4000;
      while (Date.now() < deadline) {
        const result = await pool.query("SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE $1", [`%${query}%`]);
        if (result.rowCount) return;
        await new Promise((resolve) => setTimeout(resolve, 15));
      }
      throw new Error(`Expected blocked ${query}`);
    }
    it.each(["forward", "rollback"])("documents exact-record canonical-only social/referral/DELETE disposition after %s", async (direction) => {
      const expected = await fixture(direction);
      await execute(direction === "forward" ? forward : rollback, expected);
      const canonical = direction === "forward" ? repair.newSlug : repair.oldSlug;
      const stale = direction === "forward" ? repair.oldSlug : repair.newSlug;
      const identity = { id: ownerId, role: "USER" } as NonNullable<Awaited<ReturnType<typeof authenticateApiKey>>>;
      vi.mocked(authenticateApiKey).mockResolvedValue(identity);
      vi.mocked(auth).mockResolvedValue({ user: { id: ownerId, role: "USER" } } as never);
      const follow = await import("@/app/api/v1/projects/[slug]/follow/route");
      const favorite = await import("@/app/api/v1/projects/[slug]/favorite/route");
      const collection = await import("@/app/api/v1/projects/[slug]/collection/route");
      const comments = await import("@/app/api/v1/projects/[slug]/comments/route");
      const referral = await import("@/app/api/v1/projects/[slug]/referral/route");
      const stats = await import("@/app/api/v1/projects/[slug]/referral/stats/route");
      const project = await import("@/app/api/v1/projects/[slug]/route");
      const actions = [
        { route: follow.POST, method: "POST", path: "follow", status: 200 },
        { route: follow.DELETE, method: "DELETE", path: "follow", status: 200 },
        { route: favorite.POST, method: "POST", path: "favorite", status: 201 },
        { route: favorite.DELETE, method: "DELETE", path: "favorite", status: 200 },
        { route: collection.POST, method: "POST", path: "collection", status: 200 },
        { route: collection.DELETE, method: "DELETE", path: "collection", status: 200 },
        { route: comments.GET, method: "GET", path: "comments", status: 200 },
        { route: comments.POST, method: "POST", path: "comments", status: 201 },
        { route: referral.POST, method: "POST", path: "referral", status: 201 },
        { route: stats.GET, method: "GET", path: "referral/stats", status: 200 },
        { route: project.DELETE, method: "DELETE", path: "", status: 403 },
      ];
      const relations = () => prisma.project.findUnique({ where: { id: repair.id }, include: { followers: true, favorites: true, collection: true, comments: true, referralClicks: true } });
      try {
        for (const action of actions) {
          const invoke = (slug: string) => action.route(new NextRequest(`https://keyatlas.test/api/v1/projects/${slug}/${action.path}`, {
            method: action.method, ...(action.method === "POST" ? { body: JSON.stringify({ content: "Disposable comment", ref: "fixture" }) } : {}),
          }), { params: Promise.resolve({ slug }) });
          const before = await relations();
          expect((await invoke(stale)).status, `${action.method} ${action.path} stale`).toBe(404);
          expect(await relations()).toEqual(before);
          expect((await invoke(canonical)).status, `${action.method} ${action.path} canonical`).toBe(action.status);
        }
        expect(await prisma.project.count({ where: { id: repair.id } })).toBe(1);
      } finally { vi.mocked(auth).mockResolvedValue(null as never); }
    });
    it("installed editor old/new PATCH URLs edit the same ID after forward and rollback; denied users cannot mutate", async () => {
      const before = await fixture();
      const { PATCH, GET } = await import("@/app/api/v1/projects/[slug]/route");
      let bearer: string | undefined;
      const patch = (slug: string) => PATCH(new NextRequest(`https://keyatlas.test/api/v1/projects/${slug}`, { method: "PATCH", headers: bearer ? { authorization: bearer } : {}, body: JSON.stringify({ title: repair.title }) }), { params: Promise.resolve({ slug }) });
      const realAuth = await vi.importActual<typeof import("@/lib/api-auth")>("@/lib/api-auth");
      for (const id of [ownerId, otherId]) await prisma.apiKey.create({ data: { name: "Local rework only", key: realAuth.hashKey(`kv_rework_${id}`), prefix: "kv_rework", userId: id } });
      vi.mocked(authenticateApiKey).mockImplementation(realAuth.authenticateApiKey);
      const applied = await execute(forward, before);
      for (const canonical of [repair.newSlug, repair.oldSlug]) {
        for (const slug of [repair.oldSlug, repair.newSlug]) {
          bearer = undefined;
          const untouched = await snapshot();
          for (const header of [undefined, "Basic invalid", "Bearer invalid", "Bearer kv_unknown_rework"]) {
            bearer = header;
            expect((await patch(slug)).status).toBe(401);
          }
          bearer = `Bearer kv_rework_${ownerId}`;
          for (const state of [{ revoked: true, expiresAt: null }, { revoked: false, expiresAt: new Date(0) }]) {
            await prisma.apiKey.updateMany({ where: { userId: ownerId }, data: state });
            expect((await patch(slug)).status).toBe(401);
          }
          await prisma.apiKey.updateMany({ where: { userId: ownerId }, data: { revoked: false, expiresAt: null } });
          for (const role of ["USER", "MODERATOR"] as const) {
            await prisma.user.update({ where: { id: otherId }, data: { role } });
            bearer = `Bearer kv_rework_${otherId}`;
            expect((await patch(slug)).status).toBe(403);
          }
          expect(await snapshot()).toEqual(untouched);
          for (const [id, role] of [[ownerId, "USER"], [otherId, "ADMIN"]] as const) {
            await prisma.user.update({ where: { id }, data: { role } });
            bearer = `Bearer kv_rework_${id}`;
            const response = await patch(slug);
            expect(response.status).toBe(200);
            expect((await response.json()).data).toMatchObject({ id: repair.id, slug: canonical, title: repair.title });
          }
          const response = await GET(new NextRequest(`https://keyatlas.test/api/v1/projects/${slug}`), { params: Promise.resolve({ slug }) });
          expect(response.status).toBe(200);
          expect((await response.json()).data).toMatchObject({ id: repair.id, slug: canonical });
          expect((await prisma.project.findFirst({ where: { ...projectSlugWhere(slug), published: true } }))?.id).toBe(repair.id);
        }
        if (canonical === repair.newSlug) {
          // Fixture PATCH edits advance updatedAt; saved postimage must now fail.
          await expect(execute(rollback, applied.after)).rejects.toThrow("snapshot changed");
          // Explicit fresh fixture review for rollback after those edits.
          await execute(rollback, await snapshot());
        }
      }
      await prisma.project.update({ where: { id: repair.id }, data: { published: false } });
      for (const slug of [repair.oldSlug, repair.newSlug]) expect((await GET(new NextRequest(`https://keyatlas.test/api/v1/projects/${slug}`), { params: Promise.resolve({ slug }) })).status).toBe(404);
    });
  });
});
