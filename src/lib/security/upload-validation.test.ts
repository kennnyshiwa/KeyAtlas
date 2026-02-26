import { describe, it, expect } from "vitest";
import { detectImageType, validateImageBuffer } from "./upload-validation";

describe("detectImageType", () => {
  it("detects JPEG", () => {
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Array(8).fill(0)]);
    expect(detectImageType(buf)).toBe("image/jpeg");
  });

  it("detects PNG", () => {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Array(4).fill(0)]);
    expect(detectImageType(buf)).toBe("image/png");
  });

  it("detects GIF89a", () => {
    const buf = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, ...Array(6).fill(0)]);
    expect(detectImageType(buf)).toBe("image/gif");
  });

  it("detects WebP", () => {
    // RIFF....WEBP
    const buf = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
    expect(detectImageType(buf)).toBe("image/webp");
  });

  it("detects AVIF", () => {
    // ....ftypavif
    const buf = Buffer.from([0x00, 0x00, 0x00, 0x1c, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66]);
    expect(detectImageType(buf)).toBe("image/avif");
  });

  it("returns null for unknown bytes", () => {
    const buf = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b]);
    expect(detectImageType(buf)).toBeNull();
  });

  it("returns null for too-short buffer", () => {
    expect(detectImageType(Buffer.from([0xff]))).toBeNull();
  });
});

describe("validateImageBuffer", () => {
  it("accepts valid JPEG", () => {
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Array(8).fill(0)]);
    const result = validateImageBuffer(buf);
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.detectedMime).toBe("image/jpeg");
  });

  it("rejects unknown file", () => {
    const buf = Buffer.from(Array(12).fill(0));
    const result = validateImageBuffer(buf);
    expect(result.valid).toBe(false);
  });

  it("rejects type not in allowed list", () => {
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Array(8).fill(0)]);
    const result = validateImageBuffer(buf, ["image/png"]);
    expect(result.valid).toBe(false);
  });
});
