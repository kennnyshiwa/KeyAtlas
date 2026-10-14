/**
 * Background retry for import images whose mirror failed at import time.
 *
 * Failures are recorded by mirrorImportImageUrlOrOriginal into
 * image_mirror_failures (status PENDING) while the project hotlinks the
 * original URL. This job re-attempts due rows with a long download timeout and,
 * on success, rewrites project references that still point at the source URL.
 *
 * Driven by GET /api/cron/image-mirror-retry. See docs/image-mirror-retry.md.
 */

import { prisma } from "@/lib/prisma";
import { indexProject } from "@/lib/meilisearch";
import {
  ImageMirrorError,
  RETRY_REMOTE_IMAGE_TIMEOUT_MS,
  mirrorImportImageUrlToLocal,
  rewriteImportImageUrlsInHtml,
  type MirrorImportImageOptions,
} from "@/lib/import/imgur-mirror";

export const DEFAULT_IMAGE_MIRROR_RETRY_LIMIT = 25;
export const MAX_IMAGE_MIRROR_RETRY_LIMIT = 100;
/** After this many failed retry attempts a row is marked GAVE_UP. */
export const MAX_IMAGE_MIRROR_ATTEMPTS = 8;
/**
 * After the image is mirrored (resolvedUrl set), failed reference-rewrite
 * passes are retried hourly; after this many the row is marked GAVE_UP (the
 * resolvedUrl is kept, so imports of the URL still use the mirrored copy).
 */
export const MAX_IMAGE_MIRROR_REWRITE_FAILURES = 24;
/** Wall-clock budget for one run; an attempt only starts if it can finish inside it. */
export const DEFAULT_IMAGE_MIRROR_RETRY_TIME_BUDGET_MS = 4 * 60_000;
/** Backoff after the Nth failed attempt (index N-1); the last value is the cap. */
export const IMAGE_MIRROR_RETRY_BACKOFF_MS = [
  1 * 60 * 60_000,
  4 * 60 * 60_000,
  12 * 60 * 60_000,
  24 * 60 * 60_000,
  48 * 60 * 60_000,
] as const;
/** A claimed row is hidden from overlapping runs for this long. */
const CLAIM_LEASE_MS = 10 * 60_000;
const MAX_ERROR_CHARS = 2000;
const LOG_PREFIX = "[image-mirror-retry]";

type RowOutcome =
  | { kind: "resolved" }
  | { kind: "unreferenced" }
  | { kind: "error"; error: string; permanent: boolean };

type MirrorFn = (url: string, userId?: string, options?: MirrorImportImageOptions) => Promise<string>;

export type RetryFailedImageMirrorsOptions = {
  limit?: number;
  /** Reference time for due-selection and recorded timestamps. */
  now?: Date;
  timeBudgetMs?: number;
  attemptTimeoutMs?: number;
  /** Injection points for tests. */
  mirror?: MirrorFn;
  clock?: () => number;
};

export type ImageMirrorRetrySummary = {
  scanned: number;
  resolved: number;
  failed: number;
  gaveUp: number;
  unreferenced: number;
  skipped: number;
  stoppedEarly: boolean;
  rewrites: { hero: number; gallery: number; description: number };
  errors: { sourceUrl: string; error: string }[];
};

export type ImageMirrorFailureCounts = {
  pending: number;
  due: number;
  resolved: number;
  gaveUp: number;
};

export function imageMirrorRetryBackoffMs(failedAttempts: number): number {
  const index = Math.min(Math.max(failedAttempts, 1), IMAGE_MIRROR_RETRY_BACKOFF_MS.length) - 1;
  return IMAGE_MIRROR_RETRY_BACKOFF_MS[index];
}

export function clampImageMirrorRetryLimit(value: unknown): number {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_IMAGE_MIRROR_RETRY_LIMIT;
  return Math.min(parsed, MAX_IMAGE_MIRROR_RETRY_LIMIT);
}

function errorMessage(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).slice(0, MAX_ERROR_CHARS);
}

/** Forms in which a source URL may appear inside stored description HTML. */
function descriptionSearchVariants(sourceUrl: string): string[] {
  const variants = new Set([sourceUrl]);
  if (sourceUrl.includes("&")) variants.add(sourceUrl.replace(/&/g, "&amp;"));
  return [...variants];
}

type ReferencingProject = { id: string; creatorId: string };

async function findReferencingProjects(sourceUrl: string): Promise<ReferencingProject[]> {
  const [heroProjects, galleryImages, descriptionProjects] = await Promise.all([
    prisma.project.findMany({ where: { heroImage: sourceUrl }, select: { id: true, creatorId: true } }),
    prisma.projectImage.findMany({
      where: { url: sourceUrl },
      select: { project: { select: { id: true, creatorId: true } } },
    }),
    prisma.project.findMany({
      where: {
        OR: descriptionSearchVariants(sourceUrl).map((variant) => ({ description: { contains: variant } })),
      },
      select: { id: true, creatorId: true },
    }),
  ]);

  const byId = new Map<string, ReferencingProject>();
  for (const project of [...heroProjects, ...galleryImages.map((image) => image.project), ...descriptionProjects]) {
    if (project && !byId.has(project.id)) byId.set(project.id, project);
  }
  return [...byId.values()];
}

type ProjectRewriteCounts = { hero: number; gallery: number; description: number };

/**
 * Rewrites one project's references from sourceUrl to resolvedUrl, touching
 * only values that still equal the source (compare-and-swap via updateMany
 * filters), in a single transaction. The project's updatedAt is preserved so a
 * background media fix does not look like an edit. If the description was
 * edited concurrently (CAS lost) the transaction throws so the rewrite is
 * retried on a later run against the new description.
 */
async function rewriteProjectReferences(
  projectId: string,
  sourceUrl: string,
  resolvedUrl: string,
): Promise<ProjectRewriteCounts> {
  return prisma.$transaction(async (tx) => {
    const current = await tx.project.findUnique({
      where: { id: projectId },
      select: { heroImage: true, description: true, updatedAt: true },
    });
    if (!current) return { hero: 0, gallery: 0, description: 0 };

    let hero = 0;
    if (current.heroImage === sourceUrl) {
      const result = await tx.project.updateMany({
        where: { id: projectId, heroImage: sourceUrl },
        data: { heroImage: resolvedUrl, updatedAt: current.updatedAt },
      });
      hero = result.count;
    }

    const gallery = await tx.projectImage.updateMany({
      where: { projectId, url: sourceUrl },
      data: { url: resolvedUrl },
    });

    let description = 0;
    if (current.description) {
      const rewritten = rewriteImportImageUrlsInHtml(
        current.description,
        new Map([[sourceUrl, resolvedUrl]]),
        { rewritePostimgViewerAnchors: false },
      );
      if (rewritten !== current.description) {
        const result = await tx.project.updateMany({
          where: { id: projectId, description: current.description },
          data: { description: rewritten, updatedAt: current.updatedAt },
        });
        if (result.count === 0) {
          throw new Error("description changed concurrently; rewrite will be retried");
        }
        description = result.count;
      }
    }

    return { hero, gallery: gallery.count, description };
  });
}

async function reindexProject(projectId: string): Promise<void> {
  try {
    const project = await prisma.project.findUnique({ where: { id: projectId }, include: { vendor: true } });
    // Match the app's own update paths: only published projects are indexed.
    if (project?.published) await indexProject(project);
  } catch (err) {
    console.error(`${LOG_PREFIX} search reindex failed for project ${projectId}: ${errorMessage(err)}`);
  }
}

export async function getImageMirrorFailureCounts(now: Date = new Date()): Promise<ImageMirrorFailureCounts> {
  const [pending, due, resolved, gaveUp] = await Promise.all([
    prisma.imageMirrorFailure.count({ where: { status: "PENDING" } }),
    prisma.imageMirrorFailure.count({ where: { status: "PENDING", nextAttemptAt: { lte: now } } }),
    prisma.imageMirrorFailure.count({ where: { status: "RESOLVED" } }),
    prisma.imageMirrorFailure.count({ where: { status: "GAVE_UP" } }),
  ]);
  return { pending, due, resolved, gaveUp };
}

/**
 * Retries due PENDING image mirror failures. Bounded by `limit` rows and by a
 * wall-clock budget: an attempt only starts when `attemptTimeoutMs` still fits
 * in the remaining budget, so a run cannot exceed `timeBudgetMs` (+ DB time).
 */
export async function retryFailedImageMirrors(
  options: RetryFailedImageMirrorsOptions = {},
): Promise<ImageMirrorRetrySummary> {
  const limit = clampImageMirrorRetryLimit(options.limit ?? DEFAULT_IMAGE_MIRROR_RETRY_LIMIT);
  const now = options.now ?? new Date();
  const timeBudgetMs = options.timeBudgetMs ?? DEFAULT_IMAGE_MIRROR_RETRY_TIME_BUDGET_MS;
  const attemptTimeoutMs = options.attemptTimeoutMs ?? RETRY_REMOTE_IMAGE_TIMEOUT_MS;
  const mirror = options.mirror ?? mirrorImportImageUrlToLocal;
  const clock = options.clock ?? Date.now;
  const startedAt = clock();

  const summary: ImageMirrorRetrySummary = {
    scanned: 0,
    resolved: 0,
    failed: 0,
    gaveUp: 0,
    unreferenced: 0,
    skipped: 0,
    stoppedEarly: false,
    rewrites: { hero: 0, gallery: 0, description: 0 },
    errors: [],
  };

  const rows = await prisma.imageMirrorFailure.findMany({
    where: { status: "PENDING", nextAttemptAt: { lte: now } },
    orderBy: [{ nextAttemptAt: "asc" }, { id: "asc" }],
    take: limit,
  });

  for (const row of rows) {
    if (clock() - startedAt + attemptTimeoutMs > timeBudgetMs) {
      summary.stoppedEarly = true;
      break;
    }

    // Claim the row (lease) so an overlapping run does not retry it as well.
    const claim = await prisma.imageMirrorFailure.updateMany({
      where: { id: row.id, status: "PENDING", nextAttemptAt: row.nextAttemptAt },
      data: { nextAttemptAt: new Date(now.getTime() + CLAIM_LEASE_MS) },
    });
    if (claim.count === 0) {
      summary.skipped++;
      continue;
    }
    summary.scanned++;

    // `resolvedUrl` is set once the image has been mirrored (this run or a
    // previous one). From then on the row is never re-downloaded; it stays
    // PENDING until every reference rewrite succeeds, or GAVE_UP after
    // MAX_IMAGE_MIRROR_REWRITE_FAILURES failed rewrite passes.
    let resolvedUrl: string | null = row.resolvedUrl;
    let downloaded = false;
    let outcome: RowOutcome;

    try {
      const projects = await findReferencingProjects(row.sourceUrl);

      if (projects.length === 0 && !resolvedUrl) {
        // Nothing to rewrite (e.g. a prefill that was never saved): don't spend
        // a download/upload, but keep backing off so a later save is caught.
        outcome = { kind: "unreferenced" };
      } else {
        if (!resolvedUrl) {
          resolvedUrl = await mirror(row.sourceUrl, projects[0].creatorId, { timeoutMs: attemptTimeoutMs });
          downloaded = true;
          // Persist immediately (still PENDING) so the upload is never repeated
          // and new imports of this URL can already use the mirrored copy.
          await prisma.imageMirrorFailure.update({
            where: { id: row.id },
            data: { resolvedUrl, attempts: row.attempts + 1, lastAttemptAt: now },
          });
        }

        const rewriteErrors: string[] = [];
        for (const project of projects) {
          try {
            const counts = await rewriteProjectReferences(project.id, row.sourceUrl, resolvedUrl);
            summary.rewrites.hero += counts.hero;
            summary.rewrites.gallery += counts.gallery;
            summary.rewrites.description += counts.description;
            if (counts.hero + counts.description > 0) await reindexProject(project.id);
          } catch (err) {
            rewriteErrors.push(`project ${project.id}: ${errorMessage(err)}`);
          }
        }

        if (rewriteErrors.length > 0) {
          outcome = {
            kind: "error",
            error: `Mirrored to ${resolvedUrl} but rewrite failed: ${rewriteErrors.join("; ")}`,
            permanent: false,
          };
        } else {
          await prisma.imageMirrorFailure.update({
            where: { id: row.id },
            data: { status: "RESOLVED", lastAttemptAt: now },
          });
          outcome = { kind: "resolved" };
        }
      }
    } catch (err) {
      outcome = { kind: "error", error: errorMessage(err), permanent: err instanceof ImageMirrorError && err.permanent };
    }

    if (outcome.kind === "resolved") {
      summary.resolved++;
      console.log(`${LOG_PREFIX} resolved ${row.source} ${row.sourceUrl} -> ${resolvedUrl}`);
      continue;
    }

    // Record the failure outside the try above so a failing DB write is
    // reported once and never mistaken for (or counted as) a mirror failure.
    const error = outcome.kind === "unreferenced" ? "No project references this URL" : outcome.error;
    try {
      if (resolvedUrl) {
        // Mirrored but not fully rewritten: retry the rewrite hourly (no new
        // download, download attempts untouched) up to a separate hard cap.
        const rewriteFailures = row.rewriteFailures + 1;
        const giveUp = rewriteFailures >= MAX_IMAGE_MIRROR_REWRITE_FAILURES;
        const lastError = giveUp
          ? `Gave up after ${rewriteFailures} failed reference rewrites (image mirrored to ${resolvedUrl}): ${error}`
          : error;
        await prisma.imageMirrorFailure.update({
          where: { id: row.id },
          data: {
            status: giveUp ? "GAVE_UP" : "PENDING",
            resolvedUrl,
            attempts: downloaded ? row.attempts + 1 : row.attempts,
            rewriteFailures,
            lastError: lastError.slice(0, MAX_ERROR_CHARS),
            lastAttemptAt: now,
            nextAttemptAt: giveUp ? now : new Date(now.getTime() + imageMirrorRetryBackoffMs(1)),
          },
        });
        if (giveUp) summary.gaveUp++;
        else summary.failed++;
        summary.errors.push({ sourceUrl: row.sourceUrl, error: lastError });
        console.warn(
          `${LOG_PREFIX} ${giveUp ? "gave up rewriting" : "rewrite pending for"} ${row.source} ${row.sourceUrl} -> ` +
            `${resolvedUrl} (rewrite failure ${rewriteFailures}/${MAX_IMAGE_MIRROR_REWRITE_FAILURES}): ${error}`,
        );
        continue;
      }

      const attempts = row.attempts + 1;
      const permanent = outcome.kind === "error" && outcome.permanent;
      const giveUp = permanent || attempts >= MAX_IMAGE_MIRROR_ATTEMPTS;
      await prisma.imageMirrorFailure.update({
        where: { id: row.id },
        data: {
          status: giveUp ? "GAVE_UP" : "PENDING",
          attempts,
          lastError: error.slice(0, MAX_ERROR_CHARS),
          lastAttemptAt: now,
          nextAttemptAt: giveUp ? now : new Date(now.getTime() + imageMirrorRetryBackoffMs(attempts)),
        },
      });
      if (giveUp) summary.gaveUp++;
      else summary.failed++;
      if (outcome.kind === "unreferenced") summary.unreferenced++;
      else summary.errors.push({ sourceUrl: row.sourceUrl, error });
      console.warn(
        `${LOG_PREFIX} ${giveUp ? "gave up on" : "retry failed for"} ${row.source} ${row.sourceUrl} ` +
          `(attempt ${attempts}/${MAX_IMAGE_MIRROR_ATTEMPTS}): ${error}`,
      );
    } catch (recordErr) {
      summary.errors.push({ sourceUrl: row.sourceUrl, error: `${error}; recording failed: ${errorMessage(recordErr)}` });
      console.error(`${LOG_PREFIX} could not record outcome for ${row.sourceUrl}: ${errorMessage(recordErr)}`);
    }
  }

  console.log(
    `${LOG_PREFIX} done in ${clock() - startedAt}ms — scanned=${summary.scanned} resolved=${summary.resolved} ` +
      `failed=${summary.failed} gaveUp=${summary.gaveUp} unreferenced=${summary.unreferenced} skipped=${summary.skipped} ` +
      `stoppedEarly=${summary.stoppedEarly} rewrites=hero:${summary.rewrites.hero},gallery:${summary.rewrites.gallery},` +
      `description:${summary.rewrites.description} errors=${summary.errors.length}`,
  );

  return summary;
}
