/**
 * Magic-byte signature validation for uploaded images.
 * Do not trust client-reported MIME type alone.
 */

interface MagicSignature {
  mime: string;
  bytes: number[];
  offset?: number;
}

const SIGNATURES: MagicSignature[] = [
  // JPEG: FF D8 FF
  { mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  { mime: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  // GIF87a / GIF89a
  { mime: "image/gif", bytes: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61] },
  { mime: "image/gif", bytes: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61] },
  // WebP: RIFF....WEBP
  { mime: "image/webp", bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF prefix (we also check WEBP at offset 8)
  // AVIF: ....ftypavif or ....ftypavis
  { mime: "image/avif", bytes: [0x66, 0x74, 0x79, 0x70], offset: 4 }, // "ftyp" at offset 4
];

/**
 * Detect actual image type from buffer magic bytes.
 * Returns the MIME type if recognized, or null if not a supported image.
 */
export function detectImageType(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;

  for (const sig of SIGNATURES) {
    const offset = sig.offset ?? 0;
    if (buffer.length < offset + sig.bytes.length) continue;

    const matches = sig.bytes.every((b, i) => buffer[offset + i] === b);
    if (!matches) continue;

    // Extra check for WebP: bytes 8-11 must be "WEBP"
    if (sig.mime === "image/webp") {
      if (
        buffer[8] === 0x57 &&
        buffer[9] === 0x45 &&
        buffer[10] === 0x42 &&
        buffer[11] === 0x50
      ) {
        return "image/webp";
      }
      continue;
    }

    // Extra check for AVIF: look for "avif" or "avis" after "ftyp"
    if (sig.mime === "image/avif") {
      const brand = buffer.subarray(8, 12).toString("ascii");
      if (brand === "avif" || brand === "avis" || brand === "mif1") {
        return "image/avif";
      }
      continue;
    }

    return sig.mime;
  }

  return null;
}

/**
 * Validate that a buffer's actual content matches an allowed image type.
 * Returns { valid: true, detectedMime } or { valid: false, error }.
 */
export function validateImageBuffer(
  buffer: Buffer,
  allowedMimes: string[] = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]
): { valid: true; detectedMime: string } | { valid: false; error: string } {
  const detected = detectImageType(buffer);

  if (!detected) {
    return { valid: false, error: "File does not appear to be a supported image type" };
  }

  if (!allowedMimes.includes(detected)) {
    return { valid: false, error: `Detected image type ${detected} is not allowed` };
  }

  return { valid: true, detectedMime: detected };
}
