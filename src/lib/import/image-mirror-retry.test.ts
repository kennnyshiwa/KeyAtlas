import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Minimal in-memory Prisma fake covering the query shapes used by the retry job.
type Row = Record<string, unknown>;
const db = vi.hoisted(() => ({
  failures: [] as Row[],
  projects: [] as Row[],
  images: [] as Row[],
  indexProject: vi.fn(),
}));

vi.mock("@/lib/meilisearch", () => ({ indexProject: db.indexProject }));
vi.mock("@/lib/prisma", () => {
  const same = (a: unknown, b: unknown) =>
    a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b;
  const matches = (row: Row, where: Row = {}): boolean =>
    Object.entries(where).every(([key, cond]) => {
      if (key === "OR") return (cond as Row[]).some((sub) => matches(row, sub));
      if (cond && typeof cond === "object" && !(cond instanceof Date)) {
        const c = cond as { lte?: Date; contains?: string };
        if (c.lte) return (row[key] as Date).getTime() <= c.lte.getTime();
        if (c.contains !== undefined) return typeof row[key] === "string" && (row[key] as string).includes(c.contains);
      }
      return same(row[key], cond);
    });
  const pick = (row: Row, select?: Row): Row => {
    if (!select) return { ...row };
    return Object.fromEntries(Object.keys(select).map((key) => [key, row[key]]));
  };
  const table = (rows: () => Row[]) => ({
    findMany: async ({ where, take, select }: { where?: Row; take?: number; select?: Row } = {}) =>
      rows().filter((r) => matches(r, where)).slice(0, take ?? Infinity).map((r) => pick(r, select)),
    findUnique: async ({ where, select }: { where: Row; select?: Row }) => {
      const row = rows().find((r) => matches(r, where));
      return row ? pick(row, select) : null;
    },
    updateMany: async ({ where, data }: { where: Row; data: Row }) => {
      const hits = rows().filter((r) => matches(r, where));
      hits.forEach((r) => Object.assign(r, data));
      return { count: hits.length };
    },
    update: async ({ where, data }: { where: Row; data: Row }) => {
      const row = rows().find((r) => matches(r, where));
      if (!row) throw new Error("not found");
      Object.assign(row, data);
      return { ...row };
    },
    count: async ({ where }: { where?: Row } = {}) => rows().filter((r) => matches(r, where)).length,
  });
  const projectTable = table(() => db.projects);
  const prisma: Row = {
    imageMirrorFailure: {
      ...table(() => db.failures),
      findMany: async ({ where, take }: { where: Row; take?: number }) =>
        db.failures
          .filter((r) => matches(r, where))
          .sort((a, b) => (a.nextAttemptAt as Date).getTime() - (b.nextAttemptAt as Date).getTime())
          .slice(0, take ?? Infinity)
          .map((r) => ({ ...r })),
    },
    project: {
      ...projectTable,
      findUnique: async (args: { where: Row; select?: Row; include?: Row }) => projectTable.findUnique(args),
      // Emulate Prisma's @updatedAt: bumped on every update unless supplied.
      updateMany: async (args: { where: Row; data: Row }) =>
        projectTable.updateMany({ ...args, data: { updatedAt: new Date(), ...args.data } }),
    },
    projectImage: {
      ...table(() => db.images),
      findMany: async ({ where }: { where: Row }) =>
        db.images
          .filter((r) => matches(r, where))
          .map((image) => {
            const project = db.projects.find((p) => p.id === image.projectId)!;
            return { project: { id: project.id, creatorId: project.creatorId } };
          }),
    },
  };
  prisma.$transaction = async (fn: (tx: Row) => Promise<unknown>) => fn(prisma);
  return { prisma };
});

import { ImageMirrorError } from "@/lib/import/imgur-mirror";
import { prisma } from "@/lib/prisma";
import {
  IMAGE_MIRROR_RETRY_BACKOFF_MS,
  MAX_IMAGE_MIRROR_ATTEMPTS,
  MAX_IMAGE_MIRROR_REWRITE_FAILURES,
  getImageMirrorFailureCounts,
  retryFailedImageMirrors,
} from "@/lib/import/image-mirror-retry";

const SRC = "https://i.postimg.cc/abcd1234/render.png";
const OTHER = "https://i.postimg.cc/zzzz9999/other.png";
const MIRRORED = "https://imagedelivery.net/acct/mirrored/public";
const NOW = new Date("2026-10-13T12:00:00Z");
const HOUR = 60 * 60_000;
const OLD_UPDATED_AT = new Date("2026-01-01T00:00:00Z");

function failure(overrides: Row = {}): Row {
  return {
    id: `f-${db.failures.length + 1}`,
    sourceUrl: SRC,
    source: "postimg",
    status: "PENDING",
    attempts: 0,
    rewriteFailures: 0,
    lastError: "Mirror fetch timed out after 12000ms",
    lastAttemptAt: new Date(NOW.getTime() - HOUR),
    nextAttemptAt: new Date(NOW.getTime() - 1000),
    resolvedUrl: null,
    ...overrides,
  };
}

function project(id: string, overrides: Row = {}): Row {
  return {
    id,
    creatorId: `creator-${id}`,
    heroImage: null,
    description: null,
    published: true,
    updatedAt: OLD_UPDATED_AT,
    ...overrides,
  };
}

beforeEach(() => {
  db.failures.length = 0;
  db.projects.length = 0;
  db.images.length = 0;
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("retryFailedImageMirrors — success", () => {
  it("rewrites hero, gallery and description only where they still equal the source, idempotently", async () => {
    db.failures.push(failure());
    db.projects.push(
      project("p1", {
        heroImage: SRC,
        description: `<p>intro</p><a href="${SRC}"><img src="${SRC}"></a><img src="${OTHER}">`,
      }),
      project("p2", { heroImage: OTHER, description: "<p>no images</p>" }),
      project("p3", { heroImage: "https://images.test/already-replaced.png" }),
    );
    db.images.push(
      { id: "i1", projectId: "p2", url: SRC },
      { id: "i2", projectId: "p2", url: OTHER },
      { id: "i3", projectId: "p3", url: "https://images.test/manually-edited.png" },
    );
    const mirror = vi.fn(async () => MIRRORED);

    const summary = await retryFailedImageMirrors({ now: NOW, mirror });

    expect(mirror).toHaveBeenCalledTimes(1);
    expect(mirror).toHaveBeenCalledWith(SRC, "creator-p1", { timeoutMs: 120_000 });
    expect(summary).toMatchObject({
      scanned: 1,
      resolved: 1,
      failed: 0,
      gaveUp: 0,
      rewrites: { hero: 1, gallery: 1, description: 1 },
      errors: [],
    });
    expect(db.failures[0]).toMatchObject({ status: "RESOLVED", resolvedUrl: MIRRORED, attempts: 1 });

    const [p1, p2, p3] = db.projects;
    expect(p1.heroImage).toBe(MIRRORED);
    expect(p1.description).toBe(
      `<p>intro</p><a href="${MIRRORED}"><img src="${MIRRORED}"></a><img src="${OTHER}">`,
    );
    expect(p1.updatedAt).toEqual(OLD_UPDATED_AT);
    expect(p2.heroImage).toBe(OTHER);
    expect(p2.description).toBe("<p>no images</p>");
    expect(p3.heroImage).toBe("https://images.test/already-replaced.png");
    expect(db.images.map((image) => image.url)).toEqual([MIRRORED, OTHER, "https://images.test/manually-edited.png"]);
    expect(db.indexProject).toHaveBeenCalledTimes(1);

    const snapshot = JSON.stringify({ projects: db.projects, images: db.images, failures: db.failures });
    const second = await retryFailedImageMirrors({ now: new Date(NOW.getTime() + 48 * HOUR), mirror });
    expect(second).toMatchObject({ scanned: 0, resolved: 0, rewrites: { hero: 0, gallery: 0, description: 0 } });
    expect(mirror).toHaveBeenCalledTimes(1);
    expect(JSON.stringify({ projects: db.projects, images: db.images, failures: db.failures })).toBe(snapshot);
  });

  it("rewrites HTML-entity-encoded occurrences in descriptions", async () => {
    const src = "https://massdrop-s3.imgix.net/img_thread/a.png?auto=format&fm=jpg";
    db.failures.push(failure({ sourceUrl: src, source: "drop" }));
    db.projects.push(project("p1", { description: `<img src="https://massdrop-s3.imgix.net/img_thread/a.png?auto=format&amp;fm=jpg">` }));

    const summary = await retryFailedImageMirrors({ now: NOW, mirror: async () => MIRRORED });

    expect(summary.rewrites).toEqual({ hero: 0, gallery: 0, description: 1 });
    expect(db.projects[0].description).toBe(`<img src="${MIRRORED}">`);
  });

  it("does not download images no project references, but keeps backing off", async () => {
    db.failures.push(failure());
    const mirror = vi.fn(async () => MIRRORED);

    const summary = await retryFailedImageMirrors({ now: NOW, mirror });

    expect(mirror).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ scanned: 1, unreferenced: 1, failed: 1, errors: [] });
    expect(db.failures[0]).toMatchObject({ status: "PENDING", attempts: 1 });
  });

  it("only picks due PENDING rows and respects the limit", async () => {
    db.projects.push(project("p1", { heroImage: SRC }));
    db.failures.push(
      failure({ id: "due-1" }),
      failure({ id: "due-2", sourceUrl: OTHER }),
      failure({ id: "future", nextAttemptAt: new Date(NOW.getTime() + HOUR) }),
      failure({ id: "gave-up", status: "GAVE_UP" }),
    );
    const mirror = vi.fn(async () => MIRRORED);

    const summary = await retryFailedImageMirrors({ now: NOW, mirror, limit: 1 });

    expect(summary.scanned).toBe(1);
    expect(mirror).toHaveBeenCalledTimes(1);
    expect(db.failures.find((f) => f.id === "future")!.attempts).toBe(0);
    expect(db.failures.find((f) => f.id === "gave-up")!.attempts).toBe(0);
    await expect(getImageMirrorFailureCounts(NOW)).resolves.toEqual({ pending: 2, due: 1, resolved: 1, gaveUp: 1 });
  });
});

describe("retryFailedImageMirrors — failure", () => {
  it("applies exponential backoff and gives up after the max attempts", async () => {
    db.failures.push(failure());
    db.projects.push(project("p1", { heroImage: SRC }));
    const mirror = vi.fn(async () => {
      throw new ImageMirrorError("Mirror fetch timed out after 120000ms");
    });

    const first = await retryFailedImageMirrors({ now: NOW, mirror });
    expect(first).toMatchObject({ scanned: 1, failed: 1, gaveUp: 0 });
    expect(first.errors).toEqual([{ sourceUrl: SRC, error: "Mirror fetch timed out after 120000ms" }]);
    expect(db.failures[0]).toMatchObject({
      status: "PENDING",
      attempts: 1,
      lastError: "Mirror fetch timed out after 120000ms",
      lastAttemptAt: NOW,
      nextAttemptAt: new Date(NOW.getTime() + IMAGE_MIRROR_RETRY_BACKOFF_MS[0]),
    });

    // Not due yet: nothing happens.
    expect((await retryFailedImageMirrors({ now: NOW, mirror })).scanned).toBe(0);

    const second = new Date(NOW.getTime() + IMAGE_MIRROR_RETRY_BACKOFF_MS[0]);
    await retryFailedImageMirrors({ now: second, mirror });
    expect(db.failures[0]).toMatchObject({
      attempts: 2,
      nextAttemptAt: new Date(second.getTime() + IMAGE_MIRROR_RETRY_BACKOFF_MS[1]),
    });

    // Backoff is capped at the last step.
    db.failures[0].attempts = 6;
    await retryFailedImageMirrors({ now: new Date(NOW.getTime() + 1000 * HOUR), mirror });
    expect(db.failures[0]).toMatchObject({ status: "PENDING", attempts: 7 });
    expect((db.failures[0].nextAttemptAt as Date).getTime() - (NOW.getTime() + 1000 * HOUR)).toBe(
      IMAGE_MIRROR_RETRY_BACKOFF_MS[IMAGE_MIRROR_RETRY_BACKOFF_MS.length - 1],
    );

    const last = await retryFailedImageMirrors({ now: new Date(NOW.getTime() + 2000 * HOUR), mirror });
    expect(last).toMatchObject({ gaveUp: 1, failed: 0 });
    expect(db.failures[0]).toMatchObject({ status: "GAVE_UP", attempts: MAX_IMAGE_MIRROR_ATTEMPTS });
    expect(db.projects[0].heroImage).toBe(SRC);
  });

  it("gives up immediately on a permanent 404", async () => {
    db.failures.push(failure());
    db.projects.push(project("p1", { heroImage: SRC }));

    const summary = await retryFailedImageMirrors({
      now: NOW,
      mirror: async () => {
        throw new ImageMirrorError("Mirror fetch failed (404)", { status: 404, permanent: true });
      },
    });

    expect(summary).toMatchObject({ gaveUp: 1, failed: 0 });
    expect(db.failures[0]).toMatchObject({ status: "GAVE_UP", attempts: 1, lastError: "Mirror fetch failed (404)" });
    expect(db.projects[0].heroImage).toBe(SRC);
  });

  it("stops before an attempt that could overrun the time budget", async () => {
    db.projects.push(project("p1", { heroImage: SRC, description: `<img src="${OTHER}">` }));
    db.failures.push(failure({ id: "a" }), failure({ id: "b", sourceUrl: OTHER }));
    let fakeNow = 0;
    const mirror = vi.fn(async () => {
      fakeNow += 130_000;
      throw new ImageMirrorError("Mirror fetch timed out after 120000ms");
    });

    const summary = await retryFailedImageMirrors({
      now: NOW,
      mirror,
      clock: () => fakeNow,
      attemptTimeoutMs: 120_000,
      timeBudgetMs: 240_000,
    });

    expect(mirror).toHaveBeenCalledTimes(1);
    expect(summary).toMatchObject({ scanned: 1, stoppedEarly: true });
    expect(db.failures.find((f) => f.id === "b")!.attempts).toBe(0);
  });
});

// Typed handle on the in-memory fake for spying in individual tests.
const fake = prisma as unknown as {
  imageMirrorFailure: { updateMany: (...args: unknown[]) => Promise<{ count: number }>; update: (...args: unknown[]) => Promise<Row> };
  project: { findUnique: (...args: unknown[]) => Promise<Row | null> };
};

describe("retryFailedImageMirrors — resolution lifecycle", () => {
  it("preserves updatedAt explicitly (the fake bumps it otherwise)", async () => {
    db.projects.push(project("p0", { heroImage: "x" }));
    await (prisma as unknown as { project: { updateMany: (a: unknown) => Promise<unknown> } }).project.updateMany({
      where: { id: "p0" },
      data: { heroImage: "y" },
    });
    expect(db.projects[0].updatedAt).not.toEqual(OLD_UPDATED_AT);
  });

  it("skips a row whose lease another run claimed first", async () => {
    db.failures.push(failure());
    db.projects.push(project("p1", { heroImage: SRC }));
    vi.spyOn(fake.imageMirrorFailure, "updateMany").mockResolvedValueOnce({ count: 0 });
    const mirror = vi.fn(async () => MIRRORED);

    const summary = await retryFailedImageMirrors({ now: NOW, mirror });

    expect(summary).toMatchObject({ scanned: 0, skipped: 1, resolved: 0 });
    expect(mirror).not.toHaveBeenCalled();
    expect(db.failures[0]).toMatchObject({ status: "PENDING", attempts: 0 });
  });

  it("reuses an existing resolvedUrl without downloading again", async () => {
    db.failures.push(failure({ attempts: 3, resolvedUrl: MIRRORED }));
    db.projects.push(project("p1", { heroImage: SRC }));
    const mirror = vi.fn(async () => "https://should-not-be-used.test/x.png");

    const summary = await retryFailedImageMirrors({ now: NOW, mirror });

    expect(mirror).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ resolved: 1, rewrites: { hero: 1, gallery: 0, description: 0 } });
    expect(db.projects[0].heroImage).toBe(MIRRORED);
    expect(db.projects[0].updatedAt).toEqual(OLD_UPDATED_AT); // hero-only rewrite keeps updatedAt
    expect(db.failures[0]).toMatchObject({ status: "RESOLVED", resolvedUrl: MIRRORED, attempts: 3 });
  });

  it("marks an unreferenced row that already has a resolvedUrl as RESOLVED", async () => {
    db.failures.push(failure({ resolvedUrl: MIRRORED }));

    const summary = await retryFailedImageMirrors({ now: NOW, mirror: vi.fn() });

    expect(summary).toMatchObject({ resolved: 1, unreferenced: 0, failed: 0 });
    expect(db.failures[0]).toMatchObject({ status: "RESOLVED", resolvedUrl: MIRRORED });
  });

  it("stays PENDING with resolvedUrl when a description CAS is lost, then completes on a later run", async () => {
    const userEdited = `<p>edited by owner</p><img src="${SRC}">`;
    db.failures.push(failure({ attempts: MAX_IMAGE_MIRROR_ATTEMPTS - 1 }));
    db.projects.push(project("p1", { description: userEdited }));
    // The rewrite transaction reads a stale description (owner saved in between).
    vi.spyOn(fake.project, "findUnique").mockResolvedValueOnce({
      heroImage: null,
      description: `<img src="${SRC}">`,
      updatedAt: OLD_UPDATED_AT,
    });
    const mirror = vi.fn(async () => MIRRORED);

    const first = await retryFailedImageMirrors({ now: NOW, mirror });

    expect(first).toMatchObject({ resolved: 0, failed: 1, gaveUp: 0, rewrites: { description: 0 } });
    expect(first.errors[0].error).toContain("description changed concurrently");
    expect(db.projects[0].description).toBe(userEdited);
    // Mirrored but not fully rewritten: never GAVE_UP even at the attempt cap.
    expect(db.failures[0]).toMatchObject({
      status: "PENDING",
      resolvedUrl: MIRRORED,
      attempts: MAX_IMAGE_MIRROR_ATTEMPTS,
      rewriteFailures: 1,
    });

    const second = await retryFailedImageMirrors({ now: new Date(NOW.getTime() + 2 * HOUR), mirror });

    expect(mirror).toHaveBeenCalledTimes(1);
    expect(second).toMatchObject({ resolved: 1, rewrites: { description: 1 } });
    expect(db.projects[0].description).toBe(`<p>edited by owner</p><img src="${MIRRORED}">`);
    expect(db.projects[0].updatedAt).toEqual(OLD_UPDATED_AT); // description-only rewrite keeps updatedAt
    expect(db.failures[0]).toMatchObject({ status: "RESOLVED" });
  });

  it("returns the row to PENDING (keeping resolvedUrl) when a rewrite throws", async () => {
    db.failures.push(failure());
    db.projects.push(project("p1", { heroImage: SRC }));
    vi.spyOn(prisma as unknown as { $transaction: () => Promise<unknown> }, "$transaction").mockRejectedValueOnce(
      new Error("deadlock detected"),
    );

    const summary = await retryFailedImageMirrors({ now: NOW, mirror: async () => MIRRORED });

    expect(summary).toMatchObject({ resolved: 0, failed: 1, gaveUp: 0 });
    expect(db.failures[0]).toMatchObject({
      status: "PENDING",
      resolvedUrl: MIRRORED,
      attempts: 1,
      rewriteFailures: 1,
      nextAttemptAt: new Date(NOW.getTime() + IMAGE_MIRROR_RETRY_BACKOFF_MS[0]),
    });
    expect(db.failures[0].lastError).toContain("deadlock detected");
  });

  it("gives up (keeping resolvedUrl) after the max number of failed rewrite passes", async () => {
    db.failures.push(failure({ attempts: 1, resolvedUrl: MIRRORED, rewriteFailures: MAX_IMAGE_MIRROR_REWRITE_FAILURES - 2 }));
    db.projects.push(project("p1", { heroImage: SRC }));
    vi.spyOn(prisma as unknown as { $transaction: () => Promise<unknown> }, "$transaction").mockRejectedValue(
      new Error("permission denied for table projects"),
    );
    const mirror = vi.fn(async () => MIRRORED);

    const first = await retryFailedImageMirrors({ now: NOW, mirror });
    expect(first).toMatchObject({ failed: 1, gaveUp: 0 });
    expect(db.failures[0]).toMatchObject({
      status: "PENDING",
      rewriteFailures: MAX_IMAGE_MIRROR_REWRITE_FAILURES - 1,
      nextAttemptAt: new Date(NOW.getTime() + IMAGE_MIRROR_RETRY_BACKOFF_MS[0]),
    });

    const later = new Date(NOW.getTime() + 2 * HOUR);
    const last = await retryFailedImageMirrors({ now: later, mirror });

    expect(last).toMatchObject({ failed: 0, gaveUp: 1 });
    expect(mirror).not.toHaveBeenCalled();
    expect(db.failures[0]).toMatchObject({
      status: "GAVE_UP",
      resolvedUrl: MIRRORED,
      attempts: 1, // download attempts are not touched by rewrite failures
      rewriteFailures: MAX_IMAGE_MIRROR_REWRITE_FAILURES,
    });
    expect(db.failures[0].lastError).toMatch(
      new RegExp(`^Gave up after ${MAX_IMAGE_MIRROR_REWRITE_FAILURES} failed reference rewrites \\(image mirrored to `),
    );
    expect(db.failures[0].lastError).toContain("permission denied for table projects");
    // GAVE_UP rows are no longer picked up.
    expect((await retryFailedImageMirrors({ now: new Date(later.getTime() + 10 * HOUR), mirror })).scanned).toBe(0);
    expect(MAX_IMAGE_MIRROR_REWRITE_FAILURES).toBe(24);
  });

  it("reindexes only published projects", async () => {
    db.failures.push(failure());
    db.projects.push(project("pub", { heroImage: SRC }), project("draft", { heroImage: SRC, published: false }));

    const summary = await retryFailedImageMirrors({ now: NOW, mirror: async () => MIRRORED });

    expect(summary.rewrites.hero).toBe(2);
    expect(db.indexProject).toHaveBeenCalledTimes(1);
    expect(db.indexProject.mock.calls[0][0]).toMatchObject({ id: "pub" });
  });

  it("counts a failed outcome write once, without double counting", async () => {
    db.failures.push(failure());
    db.projects.push(project("p1", { heroImage: SRC }));
    vi.spyOn(fake.imageMirrorFailure, "update").mockRejectedValue(new Error("db down"));

    const summary = await retryFailedImageMirrors({
      now: NOW,
      mirror: async () => {
        throw new ImageMirrorError("Mirror fetch timed out after 120000ms");
      },
    });

    expect(summary).toMatchObject({ scanned: 1, failed: 0, gaveUp: 0, resolved: 0 });
    expect(summary.errors).toEqual([
      { sourceUrl: SRC, error: "Mirror fetch timed out after 120000ms; recording failed: db down" },
    ]);
  });
});
