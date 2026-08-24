import { describe, expect, it, vi } from "vitest";
import {
  assertValidDescriptionImages,
  matchSourceImagesToGallery,
  selectGeekhackSourceUrl,
  validateImageUrl,
} from "@/lib/import/geekhack-media-repair";

describe("Geekhack media repair", () => {
  it("matches reordered gallery images by content hash, never position", () => {
    const first = "https://source.test/first.png";
    const second = "https://source.test/second.png";
    const gallery = ["https://images.test/second", "https://images.test/first"];
    const matches = matchSourceImagesToGallery(
      [first, second],
      gallery,
      [{ sha256: "hash-2", url: gallery[0] }, { sha256: "hash-1", url: gallery[1] }],
      new Map([[first, "hash-1"], [second, "hash-2"]]),
    );
    expect(matches).toEqual(new Map([[first, gallery[1]], [second, gallery[0]]]));
  });

  it("leaves a source unresolved when neither URL nor hash proves identity", () => {
    expect(matchSourceImagesToGallery(
      ["https://source.test/a.png"],
      ["https://images.test/unrelated"],
      [{ sha256: "other", url: "https://images.test/unrelated" }],
      new Map([["https://source.test/a.png", "source-hash"]]),
    ).size).toBe(0);
  });

  it("selects a unique GB deterministically and rejects ambiguity", () => {
    const links = [
      { type: "GEEKHACK", label: "Interest Check", url: "https://gh/ic" },
      { type: "GEEKHACK", label: "GB", url: "https://gh/gb" },
    ];
    expect(selectGeekhackSourceUrl(links)).toBe("https://gh/gb");
    expect(() => selectGeekhackSourceUrl([
      ...links,
      { type: "GEEKHACK", label: "Group Buy", url: "https://gh/gb2" },
    ])).toThrow("--source-url");
    expect(selectGeekhackSourceUrl(links, "https://gh/explicit")).toBe("https://gh/explicit");
  });

  it("falls back from HEAD to GET and requires an image response", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ ok: false, headers: new Headers() })
      .mockResolvedValueOnce({ ok: true, headers: new Headers({ "content-type": "image/png" }) });
    expect(await validateImageUrl("https://images.test/a", fetcher)).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("falls back to GET when HEAD throws", async () => {
    const fetcher = vi.fn()
      .mockRejectedValueOnce(new Error("HEAD timed out"))
      .mockResolvedValueOnce({ ok: true, headers: new Headers({ "content-type": "image/webp" }) });
    expect(await validateImageUrl("https://images.test/a", fetcher)).toBe(true);
    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      "https://images.test/a",
      expect.objectContaining({ method: "HEAD" }),
    );
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      "https://images.test/a",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("aborts validation when any description image is invalid", async () => {
    const validator = vi.fn(async (url: string) => !url.endsWith("broken.png"));
    await expect(assertValidDescriptionImages(
      '<p>text</p><img src="https://images.test/good.png"><img src="https://images.test/broken.png">',
      validator,
    )).rejects.toThrow("broken.png");
    expect(validator).toHaveBeenCalledTimes(2);
  });
});
