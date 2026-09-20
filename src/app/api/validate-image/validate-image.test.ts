import { describe, it, expect } from "vitest";
import { looksLikeImageUrl, IMAGE_EXTENSIONS } from "@/lib/image-url";

describe("looksLikeImageUrl", () => {
  it("accepts previous Cloudflare uploads without a filename extension", () => {
    expect(looksLikeImageUrl("https://imagedelivery.net/m0p8rUUdkqTB71WSkwM2sg/6d53d0af-76a3-4e7d-92f1-0113f55d3b00/public")).toBe(true);
    expect(looksLikeImageUrl("https://imagedelivery.net/account/image/thumbnail?token=abc")).toBe(true);
  });

  it.each([
    "https://imagedelivery.net.evil.test/account/image/public",
    "https://imagedelivery.net@evil.test/account/image/public",
    "https://evil.test/imagedelivery.net/account/image/public",
    "http://imagedelivery.net/account/image/public",
    "https://user:pass@imagedelivery.net/account/image/public",
    "https://imagedelivery.net:8443/account/image/public",
    "https://imagedelivery.net/account/image",
    "https://imagedelivery.net/account//public",
    "https://imagedelivery.net/",
  ])("does not recognize an invalid/lookalike delivery URL: %s", (url) => {
    expect(looksLikeImageUrl(url)).toBe(false);
  });

  it.each([
    "/photo.png",
    "/photo.jpg",
    "/photo.jpeg",
    "/photo.webp",
    "/photo.gif",
    "/photo.avif",

  ])("accepts %s", (path) => {
    expect(looksLikeImageUrl(path)).toBe(true);
  });

  it("accepts mixed-case extensions", () => {
    expect(looksLikeImageUrl("/photo.PNG")).toBe(true);
    expect(looksLikeImageUrl("/photo.JpG")).toBe(true);
    expect(looksLikeImageUrl("/photo.AVIF")).toBe(true);
  });

  it("accepts paths with querystrings", () => {
    expect(looksLikeImageUrl("/photo.jpg?width=800")).toBe(true);
    expect(looksLikeImageUrl("/photo.webp?v=2&q=80")).toBe(true);
  });

  it("accepts paths with fragments", () => {
    expect(looksLikeImageUrl("/photo.png#section")).toBe(true);
  });

  it("accepts paths with both querystring and fragment", () => {
    expect(looksLikeImageUrl("/photo.gif?w=100#top")).toBe(true);
  });

  it("rejects non-image paths", () => {
    expect(looksLikeImageUrl("/page.html")).toBe(false);
    expect(looksLikeImageUrl("/file.pdf")).toBe(false);
    expect(looksLikeImageUrl("/script.js")).toBe(false);
    expect(looksLikeImageUrl("/")).toBe(false);
    expect(looksLikeImageUrl("/no-extension")).toBe(false);
  });

  it("rejects paths where extension is substring but not at end", () => {
    expect(looksLikeImageUrl("/pngfile.txt")).toBe(false);
    expect(looksLikeImageUrl("/image.jpg.bak")).toBe(false);
  });

  it("IMAGE_EXTENSIONS includes all expected formats", () => {
    expect(IMAGE_EXTENSIONS).toEqual(
      expect.arrayContaining([".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"])
    );
  });
});
