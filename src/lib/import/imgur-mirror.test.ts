import { describe, expect, it } from "vitest";
import {
  extractMirrorableImageUrlCandidatesFromHtml,
  isGeekhackImageUrl,
  isMirrorableImportImageUrl,
  normalizeMirrorableImageUrl,
} from "@/lib/import/imgur-mirror";

describe("Geekhack/import image mirroring helpers", () => {
  it("detects Geekhack attachment images but not thread links", () => {
    expect(isGeekhackImageUrl("https://geekhack.org/index.php?action=dlattach;topic=126619.0;attach=316873;image")).toBe(true);
    expect(isMirrorableImportImageUrl("https://cdn.geekhack.org/attachments/ocean-spirit-render-jpg.12345/")).toBe(true);
    expect(isMirrorableImportImageUrl("https://geekhack.org/index.php?topic=126619.0")).toBe(false);
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
});
