import { describe, expect, it, vi } from "vitest";
import {
  appendUniqueGalleryUrls,
  parseGalleryUrlEntries,
  validateGalleryUrlEntries,
  type GalleryImage,
} from "./gallery-import";

describe("gallery URL imports", () => {
  it("parses comma and newline separated URLs in input order", () => {
    expect(parseGalleryUrlEntries(" https://img.test/one.jpg,https://img.test/two.jpg\r\nhttps://img.test/three.jpg ")).toEqual([
      "https://img.test/one.jpg",
      "https://img.test/two.jpg",
      "https://img.test/three.jpg",
    ]);
  });

  it("keeps successful entries when another entry fails", async () => {
    const validate = vi.fn(async (url: string) => {
      if (url.includes("bad")) throw new Error("URL does not point to a valid image");
      return url;
    });

    await expect(validateGalleryUrlEntries([
      "https://i.postimg.cc/one.jpg",
      "https://example.test/bad.jpg",
      "https://i.postimg.cc/two.jpg",
    ], validate)).resolves.toEqual({
      validUrls: ["https://i.postimg.cc/one.jpg", "https://i.postimg.cc/two.jpg"],
      failures: [{
        url: "https://example.test/bad.jpg",
        error: "URL does not point to a valid image",
      }],
    });
  });

  it("preserves existing gallery metadata and order while skipping duplicates", () => {
    const existing: GalleryImage[] = [{
      url: "https://existing.test/image.jpg",
      alt: "Existing alt text",
      order: 0,
      linkUrl: "https://existing.test/details",
      openInNewTab: false,
    }];

    const result = appendUniqueGalleryUrls(existing, [
      "https://i.postimg.cc/new.jpg",
      "https://existing.test/image.jpg",
      "https://i.postimg.cc/new.jpg",
    ]);

    expect(result).toEqual({
      images: [
        existing[0],
        {
          url: "https://i.postimg.cc/new.jpg",
          alt: "",
          order: 1,
          linkUrl: null,
          openInNewTab: true,
        },
      ],
      addedCount: 1,
      duplicateCount: 2,
    });
  });
});
