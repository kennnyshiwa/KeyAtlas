import crypto from "crypto";
import path from "path";
import { safeFetch } from "@/lib/security/ssrf-guard";
import { validateImageBuffer } from "@/lib/security/upload-validation";
import { getStorageProvider } from "@/lib/storage";
import { prisma } from "@/lib/prisma";

const MAX_REMOTE_IMAGE_BYTES = 20 * 1024 * 1024; // Match upload API limit
const REMOTE_IMAGE_TIMEOUT_MS = 12_000;

type MirrorableImageSource = "imgur" | "geekhack";

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

function classifyMirrorableImageUrl(input: string): MirrorableImageSource | null {
  const decoded = decodeHtmlAttributeUrl(input);

  try {
    const parsed = new URL(decoded);
    if (isImgurHostname(parsed.hostname)) return "imgur";
    if (isGeekhackImageUrlObject(parsed)) return "geekhack";
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

export async function mirrorImportImageUrlToLocal(inputUrl: string, userId?: string): Promise<string> {
  const value = normalizeMirrorableImageUrl(inputUrl);
  const source = classifyMirrorableImageUrl(value);
  if (!source) {
    throw new Error("URL is not a supported mirrorable image URL");
  }

  const parsed = new URL(value);

  const response = await safeFetch(value, {
    timeoutMs: REMOTE_IMAGE_TIMEOUT_MS,
    headers: {
      accept: "image/*",
      "user-agent": "KeyVault Imgur Mirror/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`Mirror fetch failed (${response.status})`);
  }

  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!contentType.startsWith("image/")) {
    throw new Error(`Unexpected content type: ${contentType || "unknown"}`);
  }

  const contentLengthHeader = response.headers.get("content-length");
  if (contentLengthHeader) {
    const contentLength = Number(contentLengthHeader);
    if (Number.isFinite(contentLength) && contentLength > MAX_REMOTE_IMAGE_BYTES) {
      throw new Error(`Image too large (${contentLength} bytes)`);
    }
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0) {
    throw new Error("Fetched image is empty");
  }
  if (bytes.length > MAX_REMOTE_IMAGE_BYTES) {
    throw new Error(`Image exceeds max size (${bytes.length} bytes)`);
  }

  const validation = validateImageBuffer(bytes, ALLOWED_IMAGE_MIMES);
  if (!validation.valid) {
    throw new Error(validation.error);
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

export async function mirrorImportImageUrlOrOriginal(url: string, userId?: string): Promise<string> {
  const normalized = normalizeMirrorableImageUrl(url);
  if (!isMirrorableImportImageUrl(normalized)) return url;

  try {
    return await mirrorImportImageUrlToLocal(normalized, userId);
  } catch {
    return url;
  }
}

export async function mirrorImgurUrlToLocal(inputUrl: string, userId?: string): Promise<string> {
  return mirrorImportImageUrlToLocal(inputUrl, userId);
}

export async function mirrorImgurUrlOrOriginal(url: string, userId?: string): Promise<string> {
  return mirrorImportImageUrlOrOriginal(url, userId);
}

export async function mirrorPrefillImages<T extends { url: string }>(images: T[], userId?: string): Promise<T[]> {
  return Promise.all(
    images.map(async (image) => ({
      ...image,
      url: await mirrorImportImageUrlOrOriginal(image.url, userId),
    }))
  );
}

const IMG_SRC_RE = /(<img\b[^>]*\bsrc\s*=\s*["'])([^"']+)(["'][^>]*>)/gi;
const A_HREF_RE = /(<a\b[^>]*\bhref\s*=\s*["'])([^"']+)(["'][^>]*>)/gi;

export async function mirrorImportImageSrcsInHtml(html: string, userId?: string): Promise<string> {
  if (!html) return html;

  const candidates = extractMirrorableImageUrlCandidatesFromHtml(html);
  if (candidates.size === 0) return html;

  const mirroredByNormalized = new Map<string, string>();
  for (const normalized of new Set(candidates.values())) {
    mirroredByNormalized.set(normalized, await mirrorImportImageUrlOrOriginal(normalized, userId));
  }

  const rewrites = new Map<string, string>();
  for (const [raw, normalized] of candidates.entries()) {
    rewrites.set(raw, mirroredByNormalized.get(normalized) ?? raw);
  }

  // Rewrite both img src and a href
  let result = html.replace(IMG_SRC_RE, (full, prefix: string, src: string, suffix: string) => {
    const rewritten = rewrites.get(src);
    if (!rewritten) return full;
    return `${prefix}${rewritten}${suffix}`;
  });

  result = result.replace(A_HREF_RE, (full, prefix: string, href: string, suffix: string) => {
    const rewritten = rewrites.get(href);
    if (!rewritten) return full;
    return `${prefix}${rewritten}${suffix}`;
  });

  return result;
}

export async function mirrorImgurImageSrcsInHtml(html: string, userId?: string): Promise<string> {
  return mirrorImportImageSrcsInHtml(html, userId);
}
