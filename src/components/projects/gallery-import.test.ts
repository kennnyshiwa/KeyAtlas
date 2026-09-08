import { describe, expect, it, vi } from "vitest";
import {
  appendUniqueGalleryUrls,
  parseGalleryUrlEntries,
  validateGalleryUrlEntries,
  type GalleryImage,
} from "./gallery-import";

describe("gallery URL imports", () => {
  const postimgUrl = "https://i.postimg.cc/tp3GgzDB/01-base-2026-09-07-19-00-28-Greenshot.jpg";

  it("parses comma and newline separated URLs in input order", () => {
    expect(parseGalleryUrlEntries(` ${postimgUrl},https://img.test/two.jpg\r\nhttps://img.test/three.jpg `)).toEqual([
      postimgUrl,
      "https://img.test/two.jpg",
      "https://img.test/three.jpg",
    ]);
  });

  it("keeps successful entries when another entry fails", async () => {
    const validate = vi.fn(async (url: string) => {
      if (url.includes("bad")) throw new Error("URL does not point to a valid image");
      return url;
    });

    const result = await validateGalleryUrlEntries([
      postimgUrl,
      "https://example.test/bad.jpg",
      "https://i.postimg.cc/two.jpg",
    ], validate);

    expect(result).toEqual({
      validUrls: [postimgUrl, "https://i.postimg.cc/two.jpg"],
      failures: [{
        url: "https://example.test/bad.jpg",
        error: "URL does not point to a valid image",
      }],
    });
    expect(result.failures.map((failure) => failure.url).join("\n"))
      .toBe("https://example.test/bad.jpg");
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

  it("preserves upload and link metadata through draft save/reload before importing", () => {
    const savedDraft: GalleryImage[] = [
      {
        url: "/uploads/gallery/uploaded.webp",
        alt: "Uploaded keyboard prototype",
        order: 0,
        linkUrl: null,
        openInNewTab: true,
      },
      {
        url: "https://cdn.example.test/detail.jpg",
        alt: "Detail view",
        order: 1,
        linkUrl: "https://example.test/details",
        openInNewTab: false,
      },
    ];
    const reloadedDraft = JSON.parse(JSON.stringify(savedDraft)) as GalleryImage[];

    expect(appendUniqueGalleryUrls(reloadedDraft, [postimgUrl]).images).toEqual([
      ...savedDraft,
      {
        url: postimgUrl,
        alt: "",
        order: 2,
        linkUrl: null,
        openInNewTab: true,
      },
    ]);
  });
});
