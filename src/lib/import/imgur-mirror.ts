import crypto from "crypto";
import path from "path";
import { safeFetch } from "@/lib/security/ssrf-guard";
import { validateImageBuffer } from "@/lib/security/upload-validation";
import { getStorageProvider } from "@/lib/storage";

const MAX_REMOTE_IMAGE_BYTES = 20 * 1024 * 1024; // Match upload API limit
const REMOTE_IMAGE_TIMEOUT_MS = 12_000;

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

export function isImgurUrl(input: string): boolean {
  try {
    const parsed = new URL(input.trim());
    return isImgurHostname(parsed.hostname);
  } catch {
    return false;
  }
}

function getFilenameHint(sourceUrl: URL, ext: string): string {
  const base = path.basename(sourceUrl.pathname || "");
  if (!base) return `imgur-${crypto.randomUUID()}${ext}`;

  const clean = base.replace(/[^a-zA-Z0-9._-]/g, "");
  if (!clean) return `imgur-${crypto.randomUUID()}${ext}`;
  if (path.extname(clean)) return clean;
  return `${clean}${ext}`;
}

export async function mirrorImgurUrlToLocal(inputUrl: string, userId?: string): Promise<string> {
  const value = inputUrl.trim();
  if (!isImgurUrl(value)) {
    throw new Error("URL is not an Imgur URL");
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

  const ext = MIME_TO_EXT[validation.detectedMime] ?? ".jpg";
  const filename = `${crypto.randomUUID()}-${getFilenameHint(parsed, ext)}`;

  const storage = getStorageProvider();
  return storage.upload(bytes, filename, validation.detectedMime, {
    userId,
    originalFilename: path.basename(parsed.pathname || filename),
  });
}

export async function mirrorImgurUrlOrOriginal(url: string, userId?: string): Promise<string> {
  if (!isImgurUrl(url)) return url;

  try {
    return await mirrorImgurUrlToLocal(url, userId);
  } catch {
    return url;
  }
}

export async function mirrorPrefillImages<T extends { url: string }>(images: T[], userId?: string): Promise<T[]> {
  return Promise.all(
    images.map(async (image) => ({
      ...image,
      url: await mirrorImgurUrlOrOriginal(image.url, userId),
    }))
  );
}

const IMG_SRC_RE = /(<img\b[^>]*\bsrc\s*=\s*["'])([^"']+)(["'][^>]*>)/gi;
const A_HREF_RE = /(<a\b[^>]*\bhref\s*=\s*["'])([^"']+)(["'][^>]*>)/gi;

export async function mirrorImgurImageSrcsInHtml(html: string, userId?: string): Promise<string> {
  if (!html || !html.toLowerCase().includes("imgur")) return html;

  const rewrites = new Map<string, string>();

  // Collect imgur URLs from both img src and a href
  for (const re of [IMG_SRC_RE, A_HREF_RE]) {
    re.lastIndex = 0;
    for (const match of html.matchAll(re)) {
      const url = match[2];
      if (!url || rewrites.has(url) || !isImgurUrl(url)) continue;
      rewrites.set(url, await mirrorImgurUrlOrOriginal(url, userId));
    }
  }

  if (rewrites.size === 0) return html;

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
