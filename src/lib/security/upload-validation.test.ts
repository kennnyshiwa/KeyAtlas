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
    // Complete ftyp: size, type, major brand, minor version, compatible brand.
    const buf = Buffer.alloc(20);
    buf.writeUInt32BE(20); buf.write("ftypavif", 4, "ascii"); buf.write("avif", 16, "ascii");
    expect(detectImageType(buf)).toBe("image/avif");
  });

  it.each(["mif1", "msf1", "heic", "heix", "hevc", "hevx"])("rejects unsupported %s major even with AVIF compatibility", brand => {
    const buf = Buffer.alloc(20);
    buf.writeUInt32BE(20); buf.write("ftyp", 4, "ascii");
    buf.write(brand, 8, "ascii"); buf.write("avif", 16, "ascii");
    expect(detectImageType(buf)).toBeNull();
  });

  it.each([0, 1, 12, 17, 24, 0xffffffff])("rejects malformed or unsupported ftyp size %s", size => {
    const buf = Buffer.alloc(20);
    buf.writeUInt32BE(size); buf.write("ftypavif", 4, "ascii");
    expect(detectImageType(buf)).toBeNull();
  });

  it("supports the explicit AVIF sequence brand", () => {
    const buf = Buffer.alloc(20);
    buf.writeUInt32BE(20); buf.write("ftypavis", 4, "ascii"); buf.write("avis", 16, "ascii");
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
