import { describe, expect, it } from "vitest";
import {
  extractMirrorableImageUrlCandidatesFromHtml,
  isDropImageUrl,
  isGeekhackImageUrl,
  isMirrorableImportImageUrl,
  isPostimgImageUrl,
  mirrorImportImageSrcsInHtml,
  mirrorImportMedia,
  normalizeMirrorableImageUrl,
} from "@/lib/import/imgur-mirror";

describe("Geekhack/import image mirroring helpers", () => {
  it("detects Geekhack attachment images but not thread links", () => {
    expect(isGeekhackImageUrl("https://geekhack.org/index.php?action=dlattach;topic=126619.0;attach=316873;image")).toBe(true);
    expect(isMirrorableImportImageUrl("https://cdn.geekhack.org/attachments/ocean-spirit-render-jpg.12345/")).toBe(true);
    expect(isMirrorableImportImageUrl("https://geekhack.org/index.php?topic=126619.0")).toBe(false);
  });

  it("reuses one mirrored URL for matching gallery and description sources", async () => {
    const source = "https://i.imgur.com/shared.png";
    const calls: string[] = [];
    const result = await mirrorImportMedia(
      `<p>Before <a href="${source}"><img src="${source}"></a> after</p>`,
      [{ url: source, alt: "Shared" }],
      undefined,
      async (url) => {
        calls.push(url);
        return "https://imagedelivery.net/account/shared/public";
      },
    );

    expect(calls).toEqual([source]);
    expect(result.images[0].url).toBe("https://imagedelivery.net/account/shared/public");
    expect(result.description).toBe(
      '<p>Before <a href="https://imagedelivery.net/account/shared/public"><img src="https://imagedelivery.net/account/shared/public"></a> after</p>',
    );
  });

  it("preserves text/order and mirrors description-only images separately", async () => {
    const gallerySource = "https://i.imgur.com/gallery.png";
    const descriptionOnly = "https://i.imgur.com/detail.png";
    const result = await mirrorImportMedia(
      `<p>First</p><img src="${descriptionOnly}"><p>Last</p><img src="${gallerySource}">`,
      [{ url: gallerySource }],
      undefined,
      async (url) => `https://mirror.test/${new URL(url).pathname.slice(1)}`,
    );

    expect(result.images).toEqual([{ url: "https://mirror.test/gallery.png" }]);
    expect(result.description).toBe(
      '<p>First</p><img src="https://mirror.test/detail.png"><p>Last</p><img src="https://mirror.test/gallery.png">',
    );
  });

  it("ignores decorative Geekhack chrome assets", () => {
    expect(isMirrorableImportImageUrl("https://cdn.geekhack.org/Smileys/default/wink.gif")).toBe(false);
    expect(isMirrorableImportImageUrl("https://cdn.geekhack.org/themes/default/images/logo.png")).toBe(false);
  });

  it("normalizes Geekhack sessionized URLs", () => {
    expect(
      normalizeMirrorableImageUrl(
        "https://geekhack.org/index.php?PHPSESSID=abc123&action=dlattach;topic=126619.0;attach=316873;image",
      ),
    ).toBe("https://geekhack.org/index.php?action=dlattach;topic=126619.0;attach=316873;image");
  });

  it("finds mirrorable HTML image URLs even when encoded as &amp;", () => {
    const html =
      '<p><a href="https://geekhack.org/index.php?PHPSESSID=abc123&amp;action=dlattach;topic=126619.0;attach=316873;image"><img src="https://geekhack.org/index.php?PHPSESSID=abc123&amp;action=dlattach;topic=126619.0;attach=316873;image" /></a></p>';

    expect(Array.from(extractMirrorableImageUrlCandidatesFromHtml(html).entries())).toEqual([
      [
        "https://geekhack.org/index.php?PHPSESSID=abc123&amp;action=dlattach;topic=126619.0;attach=316873;image",
        "https://geekhack.org/index.php?action=dlattach;topic=126619.0;attach=316873;image",
      ],
    ]);
  });

  it("detects Drop-hosted image URLs but not product page links", () => {
    expect(
      isDropImageUrl(
        "https://massdrop-s3.imgix.net/img_thread/1606735031009.071239620843593133481423-melgeekmdaemberkeycapsetdawn65.png?auto=format&fm=jpg&fit=min&w=796&dpr=1&q=70",
      ),
    ).toBe(true);
    expect(
      isDropImageUrl(
        "https://massdrop-s3.imgix.net/product-images/gmk-carbon-custom-keycap-set/FP/thlX0KGvSYSd8bhs9ftQ_community%20(1).jpg",
      ),
    ).toBe(true);
    expect(isMirrorableImportImageUrl("https://drop.com/buy/drop-biip-mt3-extended-custom-keycap-set/")).toBe(false);
  });

  it("detects Postimg-hosted image URLs but not viewer pages", () => {
    expect(isPostimgImageUrl("https://i.postimg.cc/abcd1234/render.png")).toBe(true);
    expect(isMirrorableImportImageUrl("https://postimg.cc/abcd1234")).toBe(false);
    expect(isMirrorableImportImageUrl("https://postimage.cc/abcd1234")).toBe(false);
  });

  it("extracts Postimg image URLs from encoded HTML", () => {
    const html =
      '<p><a href="https://postimg.cc/abcd1234"><img src="https://i.postimg.cc/abcd1234/render.png?foo=1&amp;bar=2" /></a></p>';

    expect(Array.from(extractMirrorableImageUrlCandidatesFromHtml(html).entries())).toEqual([
      [
        "https://i.postimg.cc/abcd1234/render.png?foo=1&amp;bar=2",
        "https://i.postimg.cc/abcd1234/render.png?foo=1&bar=2",
      ],
    ]);
  });

  it("rewrites Postimg viewer anchors to the mirrored image URL", async () => {
    const html =
      '<p><a href="https://postimg.cc/abcd1234"><img src="https://i.postimg.cc/abcd1234/render.png" /></a></p>';

    const mirrored = await mirrorImportImageSrcsInHtml(html);

    expect(mirrored).not.toContain('href="https://postimg.cc/abcd1234"');
    expect(mirrored).toMatch(/href="https:\/\/i\.postimg\.cc\/abcd1234\/render\.png"/);
  });
  it("extracts Drop imgix image URLs from rich HTML descriptions", () => {
    const html =
      '<p><a href="https://massdrop-s3.imgix.net/img_thread/1606735031009.071239620843593133481423-melgeekmdaemberkeycapsetdawn65.png?auto=format&amp;fm=jpg&amp;fit=min&amp;w=796&amp;dpr=1&amp;q=70"><img src="https://massdrop-s3.imgix.net/img_thread/1606735031009.071239620843593133481423-melgeekmdaemberkeycapsetdawn65.png?auto=format&amp;fm=jpg&amp;fit=min&amp;w=796&amp;dpr=1&amp;q=70" /></a></p>';

    expect(Array.from(extractMirrorableImageUrlCandidatesFromHtml(html).entries())).toEqual([
      [
        "https://massdrop-s3.imgix.net/img_thread/1606735031009.071239620843593133481423-melgeekmdaemberkeycapsetdawn65.png?auto=format&amp;fm=jpg&amp;fit=min&amp;w=796&amp;dpr=1&amp;q=70",
        "https://massdrop-s3.imgix.net/img_thread/1606735031009.071239620843593133481423-melgeekmdaemberkeycapsetdawn65.png?auto=format&fm=jpg&fit=min&w=796&dpr=1&q=70",
      ],
    ]);
  });
});
