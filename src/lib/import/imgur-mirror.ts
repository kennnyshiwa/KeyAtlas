import crypto from "crypto";
import path from "path";
import { safeFetch } from "@/lib/security/ssrf-guard";
import { validateImageBuffer } from "@/lib/security/upload-validation";
import { getStorageProvider } from "@/lib/storage";
import { prisma } from "@/lib/prisma";

export const MAX_REMOTE_IMAGE_BYTES = 20 * 1024 * 1024; // Match upload API limit

/**
 * Mirror download timeouts.
 *
 * safeFetch passes `AbortSignal.timeout(timeoutMs)` to fetch(); undici keeps
 * that signal attached to the response body, so the timeout is a TOTAL
 * deadline covering connect + headers + the whole streamed body read (a body
 * read still in progress when it fires rejects with a TimeoutError). We pick
 * the deadline per source: fast hosts keep a short one, slow hosts
 * (i.postimg.cc can take ~100 s for an 860 KB file from the prod server) get a
 * moderately longer one at import time. Import-time mirroring is additionally
 * bounded by a per-call budget (IMPORT_MIRROR_TIME_BUDGET_MS) so a topic full
 * of slow images cannot stall an import; the long-timeout path (120 s, enough
 * for a slow-but-progressing download) belongs to the background retry job.
 * Note: if the host answers with a redirect, safeFetch follows it with a fresh
 * timeout, so the worst case is ~2x the per-fetch value.
 */
export const REMOTE_IMAGE_TIMEOUT_MS = 12_000;
/** Import-time timeout for slow hosts (postimg). */
export const SLOW_HOST_REMOTE_IMAGE_TIMEOUT_MS = 30_000;
/** Timeout used by the background retry job, regardless of source. */
export const RETRY_REMOTE_IMAGE_TIMEOUT_MS = 120_000;
/** Total time one import call may spend mirroring images. */
export const IMPORT_MIRROR_TIME_BUDGET_MS = 90_000;
export const IMPORT_MIRROR_BUDGET_EXHAUSTED = "import mirror budget exhausted";
/** Don't start a fetch with less than this much budget left. */
const MIN_IMPORT_FETCH_MS = 1_000;

export type MirrorableImageSource = "imgur" | "geekhack" | "drop" | "postimg";

const REMOTE_IMAGE_TIMEOUT_MS_BY_SOURCE: Record<MirrorableImageSource, number> = {
  imgur: REMOTE_IMAGE_TIMEOUT_MS,
  geekhack: REMOTE_IMAGE_TIMEOUT_MS,
  drop: REMOTE_IMAGE_TIMEOUT_MS,
  postimg: SLOW_HOST_REMOTE_IMAGE_TIMEOUT_MS,
};

export function getMirrorTimeoutMs(source: MirrorableImageSource): number {
  return REMOTE_IMAGE_TIMEOUT_MS_BY_SOURCE[source] ?? REMOTE_IMAGE_TIMEOUT_MS;
}

/**
 * Mirror failure. `permanent` marks failures retrying cannot fix (HTTP 404/410,
 * image larger than the limit); the retry job gives up on those immediately.
 */
export class ImageMirrorError extends Error {
  readonly status?: number;
  readonly permanent: boolean;

  constructor(message: string, options: { status?: number; permanent?: boolean; cause?: unknown } = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "ImageMirrorError";
    this.status = options.status;
    this.permanent = options.permanent ?? false;
  }
}

const PERMANENT_HTTP_STATUSES = new Set([404, 410]);

function parseContentLength(header: string | null): number | null {
  if (!header || !/^\s*\d+\s*$/.test(header)) return null;
  const value = Number(header);
  return Number.isSafeInteger(value) ? value : null;
}

/**
 * Streams a response body into a Buffer, aborting as soon as more than
 * `maxBytes` have been received (instead of buffering the whole body first).
 * When the response declares an identity-encoded Content-Length, the number of
 * bytes actually read must match it exactly; a short read (connection dropped
 * mid-body) is an error rather than a silently truncated image.
 */
export async function readResponseBodyWithLimit(response: Response, maxBytes: number): Promise<Buffer> {
  const declaredLength = parseContentLength(response.headers.get("content-length"));
  const encoding = response.headers.get("content-encoding")?.trim().toLowerCase() ?? "";
  const lengthDescribesBody = !encoding || encoding === "identity";

  if (declaredLength !== null && declaredLength > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new ImageMirrorError(`Image too large (${declaredLength} bytes)`, { permanent: true });
  }

  if (!response.body) {
    throw new ImageMirrorError("Fetched image is empty");
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new ImageMirrorError(`Image exceeds max size (more than ${maxBytes} bytes)`, { permanent: true });
    }
    chunks.push(value);
  }

  if (declaredLength !== null && lengthDescribesBody && received !== declaredLength) {
    throw new ImageMirrorError(
      received < declaredLength
        ? `Short read: received ${received} of ${declaredLength} bytes`
        : `Body length mismatch: received ${received} bytes, Content-Length ${declaredLength}`,
    );
  }

  return Buffer.concat(chunks, received);
}

const ALLOWED_IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/avif": ".avif",
};

function isImgurHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "imgur.com" || host === "www.imgur.com" || host === "i.imgur.com";
}

function isGeekhackHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "geekhack.org" || host === "www.geekhack.org" || host === "cdn.geekhack.org";
}

function isDropHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === "drop.com" ||
    host === "www.drop.com" ||
    host === "massdrop.com" ||
    host === "www.massdrop.com" ||
    host === "www1.massdrop.com" ||
    host === "massdrop-s3.imgix.net"
  );
}

function isPostimgImageHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "i.postimg.cc";
}

function isPostimgViewerHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === "postimg.cc" ||
    host === "www.postimg.cc" ||
    host === "postimage.cc" ||
    host === "www.postimage.cc"
  );
}

function decodeHtmlAttributeUrl(input: string): string {
  return input
    .trim()
    .replace(/&amp;/gi, "&")
    .replace(/&#0*38;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'");
}

function isGeekhackDecorativeImagePath(pathname: string): boolean {
  const lowerPath = pathname.toLowerCase();
  return (
    lowerPath.includes("/smileys/") ||
    /\/themes\/[^/]+\/images\//i.test(lowerPath) ||
    lowerPath.includes("/avatars/") ||
    lowerPath.endsWith(".svg") ||
    lowerPath.endsWith("banner.png")
  );
}

function isGeekhackImageUrlObject(parsed: URL): boolean {
  if (!isGeekhackHostname(parsed.hostname)) return false;
  if (isGeekhackDecorativeImagePath(parsed.pathname)) return false;

  const lowerSearch = parsed.search.toLowerCase();
  const lowerPath = parsed.pathname.toLowerCase();

  if (lowerSearch.includes("action=dlattach")) return true;
  if (lowerPath.includes("/attachments/")) return true;
  return /\.(?:jpe?g|png|gif|webp|avif)$/i.test(lowerPath);
}

function isDropImageUrlObject(parsed: URL): boolean {
  if (!isDropHostname(parsed.hostname)) return false;

  const lowerPath = parsed.pathname.toLowerCase();
  if (/\.(?:jpe?g|png|gif|webp|avif)$/i.test(lowerPath)) return true;

  // Drop commonly serves legacy assets through imgix with image-y path prefixes
  // and format/query transforms instead of clean file extensions.
  if (
    parsed.hostname.toLowerCase() === "massdrop-s3.imgix.net" &&
    (/\/(?:img_comment|img_thread|product-images)\//i.test(parsed.pathname) ||
      parsed.searchParams.has("fm") ||
      parsed.searchParams.has("auto"))
  ) {
    return true;
  }

  return false;
}

function isPostimgImageUrlObject(parsed: URL): boolean {
  if (!isPostimgImageHostname(parsed.hostname)) return false;
  return /\.(?:jpe?g|png|gif|webp|avif)$/i.test(parsed.pathname.toLowerCase());
}

export function classifyMirrorableImageUrl(input: string): MirrorableImageSource | null {
  const decoded = decodeHtmlAttributeUrl(input);

  try {
    const parsed = new URL(decoded);
    if (isImgurHostname(parsed.hostname)) return "imgur";
    if (isGeekhackImageUrlObject(parsed)) return "geekhack";
    if (isDropImageUrlObject(parsed)) return "drop";
    if (isPostimgImageUrlObject(parsed)) return "postimg";
    return null;
  } catch {
    return null;
  }
}

export function isImgurUrl(input: string): boolean {
  return classifyMirrorableImageUrl(input) === "imgur";
}

export function isGeekhackImageUrl(input: string): boolean {
  return classifyMirrorableImageUrl(input) === "geekhack";
}

export function isDropImageUrl(input: string): boolean {
  return classifyMirrorableImageUrl(input) === "drop";
}

export function isPostimgImageUrl(input: string): boolean {
  return classifyMirrorableImageUrl(input) === "postimg";
}

export function isMirrorableImportImageUrl(input: string): boolean {
  return classifyMirrorableImageUrl(input) !== null;
}

export function normalizeMirrorableImageUrl(input: string): string {
  const decoded = decodeHtmlAttributeUrl(input);
  const source = classifyMirrorableImageUrl(decoded);
  if (source !== "geekhack") return decoded;

  return decoded
    .replace(/^http:\/\//i, "https://")
    .replace(/([?&;])PHPSESSID=[^&;]+([&;]?)/i, (_full, prefix: string, suffix: string) => {
      if (prefix === "?") return suffix ? "?" : "";
      return suffix && suffix !== prefix ? prefix : "";
    })
    .replace(/\?&/, "?")
    .replace(/\?;/, "?")
    .replace(/&&+/g, "&")
    .replace(/[?&;]$/, "");
}

export function extractMirrorableImageUrlCandidatesFromHtml(html: string): Map<string, string> {
  const candidates = new Map<string, string>();

  for (const re of [IMG_SRC_RE, A_HREF_RE]) {
    re.lastIndex = 0;
    for (const match of html.matchAll(re)) {
      const rawUrl = match[2];
      const normalized = rawUrl ? normalizeMirrorableImageUrl(rawUrl) : "";
      if (!normalized || !isMirrorableImportImageUrl(normalized) || candidates.has(rawUrl)) continue;
      candidates.set(rawUrl, normalized);
    }
  }

  return candidates;
}

function getFilenameHint(sourceUrl: URL, ext: string, source: MirrorableImageSource): string {
  const base = path.basename(sourceUrl.pathname || "");
  const attachId = sourceUrl.search.match(/(?:^|[?&;])attach=(\d+)/i)?.[1];
  if (!base || base === "index.php") {
    const token = attachId ?? crypto.randomUUID();
    return `${source}-${token}${ext}`;
  }

  const clean = base.replace(/[^a-zA-Z0-9._-]/g, "");
  if (!clean) return `${source}-${attachId ?? crypto.randomUUID()}${ext}`;
  if (path.extname(clean)) return clean;
  return `${clean}${ext}`;
}

export type MirrorImportImageOptions = {
  /** Total download deadline (headers + body). Defaults to the per-source value. */
  timeoutMs?: number;
};

function isTimeoutError(err: unknown): boolean {
  return err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
}

export async function mirrorImportImageUrlToLocal(
  inputUrl: string,
  userId?: string,
  options: MirrorImportImageOptions = {},
): Promise<string> {
  const value = normalizeMirrorableImageUrl(inputUrl);
  const source = classifyMirrorableImageUrl(value);
  if (!source) {
    throw new Error("URL is not a supported mirrorable image URL");
  }

  const parsed = new URL(value);
  const timeoutMs = options.timeoutMs ?? getMirrorTimeoutMs(source);

  let bytes: Buffer;
  try {
    const response = await safeFetch(value, {
      timeoutMs,
      headers: {
        accept: "image/*",
        "user-agent": "KeyVault Imgur Mirror/1.0",
      },
    });

    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new ImageMirrorError(`Mirror fetch failed (${response.status})`, {
        status: response.status,
        permanent: PERMANENT_HTTP_STATUSES.has(response.status),
      });
    }

    const contentType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
    if (!contentType.startsWith("image/")) {
      await response.body?.cancel().catch(() => undefined);
      throw new ImageMirrorError(`Unexpected content type: ${contentType || "unknown"}`, { permanent: true });
    }

    bytes = await readResponseBodyWithLimit(response, MAX_REMOTE_IMAGE_BYTES);
  } catch (err) {
    if (isTimeoutError(err)) {
      throw new ImageMirrorError(`Mirror fetch timed out after ${timeoutMs}ms`, { cause: err });
    }
    throw err;
  }

  if (bytes.length === 0) {
    throw new ImageMirrorError("Fetched image is empty");
  }

  const validation = validateImageBuffer(bytes, ALLOWED_IMAGE_MIMES);
  if (!validation.valid) {
    throw new ImageMirrorError(validation.error, { permanent: true });
  }

  // Content-hash dedup: return existing URL if we've seen this exact image
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  const existing = await prisma.imageAsset.findUnique({ where: { sha256 } });
  if (existing) {
    return existing.url;
  }

  const ext = MIME_TO_EXT[validation.detectedMime] ?? ".jpg";
  const filename = `${crypto.randomUUID()}-${getFilenameHint(parsed, ext, source)}`;

  const storage = getStorageProvider();
  const url = await storage.upload(bytes, filename, validation.detectedMime, {
    userId,
    originalFilename: path.basename(parsed.pathname || filename),
  });

  // Record in dedup table so future uploads of the same image are caught.
  // Some mirror paths may run without a user context, so only persist the
  // dedup row when we have a valid uploaderId.
  if (userId) {
    await prisma.imageAsset.create({
      data: {
        sha256,
        url,
        bytes: bytes.length,
        contentType: validation.detectedMime,
        uploaderId: userId,
      },
    });
  }

  return url;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const MAX_RECORDED_ERROR_CHARS = 2000;

/**
 * Durably records a failed import-image mirror so the image-mirror-retry cron
 * can retry it later (see docs/image-mirror-retry.md). Never throws.
 *
 * - New URL: creates a PENDING row due immediately (attempts=0; only retry-job
 *   attempts are counted).
 * - Existing row (any status): only lastError/lastAttemptAt are refreshed, so
 *   a GAVE_UP or RESOLVED row is never reset and PENDING backoff is untouched.
 *   With `preserveExistingError` (budget exhaustion — no fetch was attempted)
 *   an existing row is left completely untouched.
 *
 * Returns the row's resolvedUrl when the retry job has already mirrored the
 * image (RESOLVED, or PENDING awaiting reference rewrites), so callers can use
 * the mirrored copy instead of hotlinking.
 */
export async function recordImageMirrorFailure(
  sourceUrl: string,
  source: MirrorableImageSource,
  error: unknown,
  options: { preserveExistingError?: boolean } = {},
): Promise<string | null> {
  const message = errorMessage(error).slice(0, MAX_RECORDED_ERROR_CHARS);
  const now = new Date();

  try {
    const row = await prisma.imageMirrorFailure.upsert({
      where: { sourceUrl },
      create: {
        sourceUrl,
        source,
        status: "PENDING",
        attempts: 0,
        lastError: message,
        lastAttemptAt: now,
        nextAttemptAt: now,
      },
      update: options.preserveExistingError ? {} : { lastError: message, lastAttemptAt: now },
      select: { status: true, resolvedUrl: true },
    });

    if (row.resolvedUrl) {
      console.warn(
        `[image-mirror] failed ${source} ${sourceUrl}: ${message} — using previously resolved mirror ${row.resolvedUrl}`,
      );
      return row.resolvedUrl;
    }

    console.warn(
      `[image-mirror] failed ${source} ${sourceUrl}: ${message} — recorded for retry (status=${row.status})`,
    );
    return null;
  } catch (recordErr) {
    console.error(
      `[image-mirror] failed ${source} ${sourceUrl}: ${message} — could not record for retry: ${errorMessage(recordErr)}`,
    );
    return null;
  }
}

/**
 * Mirrors an import image, falling back to the (normalized) original URL
 * (hotlink) on failure. Failures are recorded in image_mirror_failures for
 * later retry. The fallback is the normalized form so the stored hero/gallery
 * value equals the failure row's sourceUrl, which the retry job matches.
 */
export async function mirrorImportImageUrlOrOriginal(
  url: string,
  userId?: string,
  options: MirrorImportImageOptions = {},
): Promise<string> {
  const normalized = normalizeMirrorableImageUrl(url);
  const source = classifyMirrorableImageUrl(normalized);
  if (!source) return url;

  try {
    return await mirrorImportImageUrlToLocal(normalized, userId, options);
  } catch (err) {
    const resolvedUrl = await recordImageMirrorFailure(normalized, source, err);
    return resolvedUrl ?? normalized;
  }
}

/** Wall-clock budget shared by the mirror calls of one import. */
export type ImportMirrorBudget = { remainingMs(): number };

export function createImportMirrorBudget(
  budgetMs: number = IMPORT_MIRROR_TIME_BUDGET_MS,
  clock: () => number = Date.now,
): ImportMirrorBudget {
  const deadline = clock() + budgetMs;
  return { remainingMs: () => Math.max(0, deadline - clock()) };
}

export type ImportMirrorBudgetOptions = {
  /** Share one budget across several calls (e.g. description + gallery). */
  budget?: ImportMirrorBudget;
  /** Budget for this call when `budget` is not given (default 90 s). */
  budgetMs?: number;
  clock?: () => number;
};

function resolveImportMirrorBudget(options: ImportMirrorBudgetOptions): ImportMirrorBudget {
  return options.budget ?? createImportMirrorBudget(options.budgetMs, options.clock);
}

/**
 * Bounds a mirror function by an import budget: each fetch's timeout is capped
 * at the remaining budget, and once it is spent remaining mirrorable URLs are
 * not fetched — they are recorded as PENDING failures for the retry job and the
 * (normalized) original URL is kept (hotlink fallback).
 */
function withImportMirrorBudget(mirrorUrl: MirrorUrl, budget: ImportMirrorBudget): MirrorUrl {
  return async (url, userId) => {
    const normalized = normalizeMirrorableImageUrl(url);
    const source = classifyMirrorableImageUrl(normalized);
    if (!source) return mirrorUrl(url, userId);

    const remainingMs = budget.remainingMs();
    if (remainingMs < MIN_IMPORT_FETCH_MS) {
      const resolvedUrl = await recordImageMirrorFailure(
        normalized,
        source,
        new ImageMirrorError(IMPORT_MIRROR_BUDGET_EXHAUSTED),
        { preserveExistingError: true },
      );
      return resolvedUrl ?? normalized;
    }

    return mirrorUrl(url, userId, { timeoutMs: Math.min(getMirrorTimeoutMs(source), remainingMs) });
  };
}

export async function mirrorImgurUrlToLocal(inputUrl: string, userId?: string): Promise<string> {
  return mirrorImportImageUrlToLocal(inputUrl, userId);
}

export async function mirrorImgurUrlOrOriginal(url: string, userId?: string): Promise<string> {
  return mirrorImportImageUrlOrOriginal(url, userId);
}

/**
 * Mirrors prefill images in parallel. Bounded by the import budget: every
 * fetch's timeout is capped at the remaining budget, so the whole call cannot
 * take (much) longer than the budget.
 */
export async function mirrorPrefillImages<T extends { url: string }>(
  images: T[],
  userId?: string,
  options: ImportMirrorBudgetOptions = {},
): Promise<T[]> {
  const mirror = withImportMirrorBudget(mirrorImportImageUrlOrOriginal, resolveImportMirrorBudget(options));
  return Promise.all(
    images.map(async (image) => ({
      ...image,
      url: await mirror(image.url, userId),
    }))
  );
}

type ImportImage = { url: string };
export type MirrorUrl = (url: string, userId?: string, options?: MirrorImportImageOptions) => Promise<string>;

export type MirroredImportMedia<T extends ImportImage> = {
  description: string;
  images: T[];
};

const IMG_SRC_RE = /(<img\b[^>]*\bsrc\s*=\s*["'])([^"']+)(["'][^>]*>)/gi;
const A_HREF_RE = /(<a\b[^>]*\bhref\s*=\s*["'])([^"']+)(["'][^>]*>)/gi;
const ANCHOR_RE = /<a\b([^>]*\bhref\s*=\s*["'])([^"']+)(["'][^>]*)>([\s\S]*?)<\/a>/gi;

export function rewriteImportImageUrlsInHtml(
  html: string,
  mirroredByNormalized: ReadonlyMap<string, string>,
  options: { rewritePostimgViewerAnchors?: boolean } = {},
): string {
  const rewrite = (rawUrl: string): string | null => {
    const normalized = normalizeMirrorableImageUrl(rawUrl);
    return mirroredByNormalized.get(normalized) ?? null;
  };

  let result = html.replace(IMG_SRC_RE, (full, prefix: string, src: string, suffix: string) => {
    const rewritten = rewrite(src);
    return rewritten ? `${prefix}${rewritten}${suffix}` : full;
  });

  result = result.replace(A_HREF_RE, (full, prefix: string, href: string, suffix: string) => {
    const rewritten = rewrite(href);
    return rewritten ? `${prefix}${rewritten}${suffix}` : full;
  });

  return options.rewritePostimgViewerAnchors === false ? result : rewritePostimgViewerAnchorsToImageUrl(result);
}

/** Max concurrent gallery mirror fetches in mirrorImportMedia. */
export const IMPORT_MIRROR_CONCURRENCY = 4;

export type MirrorImportMediaOptions = ImportMirrorBudgetOptions & {
  /** Gallery worker-pool size (default IMPORT_MIRROR_CONCURRENCY). */
  concurrency?: number;
};

/**
 * Mirrors gallery and rich-description media as one operation.
 *
 * - Gallery images are mirrored first by a small worker pool (default 4
 *   concurrent fetches); output order matches input order.
 * - Description-only images are mirrored afterwards, one at a time.
 * - Every normalized source URL is fetched at most once, even when duplicates
 *   are in flight concurrently (callers share the in-flight promise), and a
 *   gallery result is reused for the same image in the description.
 * - Bounded by the import budget (default 90 s); URLs reached after it is spent
 *   are recorded for retry (PENDING) and keep their original URL.
 */
export async function mirrorImportMedia<T extends ImportImage>(
  description: string,
  images: T[],
  userId?: string,
  mirrorUrlUnbounded: MirrorUrl = mirrorImportImageUrlOrOriginal,
  options: MirrorImportMediaOptions = {},
): Promise<MirroredImportMedia<T>> {
  const mirrorUrl = withImportMirrorBudget(mirrorUrlUnbounded, resolveImportMirrorBudget(options));
  const inFlight = new Map<string, Promise<string>>();
  const mirrorOnce = (normalized: string): Promise<string> => {
    let pending = inFlight.get(normalized);
    if (!pending) {
      pending = mirrorUrl(normalized, userId);
      inFlight.set(normalized, pending);
    }
    return pending;
  };

  const galleryUrls = images.map((image) => normalizeMirrorableImageUrl(image.url));
  const mirroredGallery: string[] = new Array(images.length);
  const concurrency = Math.max(1, Math.floor(options.concurrency ?? IMPORT_MIRROR_CONCURRENCY));
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < galleryUrls.length) {
      const index = nextIndex++;
      mirroredGallery[index] = await mirrorOnce(galleryUrls[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, galleryUrls.length) }, worker));

  const mirroredByNormalized = new Map<string, string>();
  galleryUrls.forEach((normalized, index) => mirroredByNormalized.set(normalized, mirroredGallery[index]));

  const candidates = extractMirrorableImageUrlCandidatesFromHtml(description);
  for (const normalized of new Set(candidates.values())) {
    if (!mirroredByNormalized.has(normalized)) {
      mirroredByNormalized.set(normalized, await mirrorOnce(normalized));
    }
  }

  return {
    description: rewriteImportImageUrlsInHtml(description, mirroredByNormalized),
    images: images.map((image, index) => ({ ...image, url: mirroredGallery[index] })),
  };
}

function isPostimgViewerUrl(input: string): boolean {
  try {
    const parsed = new URL(decodeHtmlAttributeUrl(input));
    return isPostimgViewerHostname(parsed.hostname);
  } catch {
    return false;
  }
}

function rewritePostimgViewerAnchorsToImageUrl(html: string): string {
  return html.replace(ANCHOR_RE, (full, prefix: string, href: string, suffix: string, inner: string) => {
    if (!isPostimgViewerUrl(href)) return full;

    const match = inner.match(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i);
    const imageUrl = match?.[1]?.trim();
    if (!imageUrl) return full;

    return `<a${prefix}${imageUrl}${suffix}>${inner}</a>`;
  });
}

export async function mirrorImportImageSrcsInHtml(
  html: string,
  userId?: string,
  options: ImportMirrorBudgetOptions = {},
): Promise<string> {
  if (!html) return html;

  const candidates = extractMirrorableImageUrlCandidatesFromHtml(html);
  if (candidates.size === 0) return html;

  const mirror = withImportMirrorBudget(mirrorImportImageUrlOrOriginal, resolveImportMirrorBudget(options));
  const mirroredByNormalized = new Map<string, string>();
  for (const normalized of new Set(candidates.values())) {
    mirroredByNormalized.set(normalized, await mirror(normalized, userId));
  }

  const rewrites = new Map<string, string>();
  for (const [raw, normalized] of candidates.entries()) {
    rewrites.set(raw, mirroredByNormalized.get(normalized) ?? raw);
  }

  const normalizedRewrites = new Map<string, string>();
  for (const [raw, rewritten] of rewrites) {
    normalizedRewrites.set(normalizeMirrorableImageUrl(raw), rewritten);
  }
  return rewriteImportImageUrlsInHtml(html, normalizedRewrites);
}

export async function mirrorImgurImageSrcsInHtml(
  html: string,
  userId?: string,
  options: ImportMirrorBudgetOptions = {},
): Promise<string> {
  return mirrorImportImageSrcsInHtml(html, userId, options);
}
