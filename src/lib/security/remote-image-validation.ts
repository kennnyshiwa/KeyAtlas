import { safeFetch, UrlSafetyError } from "./ssrf-guard";

const ALLOWED_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
];
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const VALIDATION_TIMEOUT_MS = 5000;
const HEAD_FALLBACK_STATUSES = new Set([405, 408, 425, 429, 500, 501, 502, 503, 504]);

export class ImageUrlValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageUrlValidationError";
  }
}

function responseSize(response: Response): number | null {
  const contentRange = response.headers.get("content-range");
  const rangeTotal = contentRange?.match(/\/(\d+)$/)?.[1];
  // A 206 Content-Length is only the returned slice, not the image total.
  const value = rangeTotal ?? (response.status === 206 ? null : response.headers.get("content-length"));
  if (!value || !/^\d+$/.test(value)) return null;
  const size = Number(value);
  return Number.isFinite(size) && size >= 0 ? size : null;
}

function assertValidImageResponse(response: Response): void {
  if (!response.ok) {
    throw new ImageUrlValidationError(`Could not reach image URL (HTTP ${response.status})`);
  }

  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (!contentType || !ALLOWED_CONTENT_TYPES.includes(contentType)) {
    throw new ImageUrlValidationError("URL does not point to a valid image (JPEG, PNG, WebP, GIF, AVIF)");
  }

  const size = responseSize(response);
  if (size === null) {
    throw new ImageUrlValidationError("Could not determine image size");
  }
  if (size > MAX_IMAGE_BYTES) {
    throw new ImageUrlValidationError("Image is too large. Maximum size is 20MB");
  }
}

async function rangeGet(url: string): Promise<Response> {
  return safeFetch(url, {
    method: "GET",
    timeoutMs: VALIDATION_TIMEOUT_MS,
    allowedProtocols: ["https:"],
    headers: { Range: "bytes=0-0", Accept: "image/*" },
  });
}

export async function validateRemoteImage(url: string): Promise<void> {
  let response: Response;
  try {
    response = await safeFetch(url, {
      method: "HEAD",
      timeoutMs: VALIDATION_TIMEOUT_MS,
      allowedProtocols: ["https:"],
    });
  } catch (error) {
    if (error instanceof UrlSafetyError) throw error;
    response = await rangeGet(url);
    try {
      assertValidImageResponse(response);
    } finally {
      await response.body?.cancel();
    }
    return;
  }

  if (HEAD_FALLBACK_STATUSES.has(response.status)) {
    response = await rangeGet(url);
    try {
      assertValidImageResponse(response);
    } finally {
      await response.body?.cancel();
    }
    return;
  }

  assertValidImageResponse(response);
}
