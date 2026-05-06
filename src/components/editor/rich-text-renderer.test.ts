import { describe, expect, it } from "vitest";
import { preserveEmptyParagraphSpacing } from "@/components/editor/rich-text-renderer";

describe("preserveEmptyParagraphSpacing", () => {
  it("keeps intentional blank paragraphs visible", () => {
    expect(preserveEmptyParagraphSpacing("<p>Intro</p><p></p><h2>Heading</h2>")).toBe(
      "<p>Intro</p><p><br /></p><h2>Heading</h2>",
    );
  });

  it("preserves styled empty paragraphs from the editor", () => {
    expect(
      preserveEmptyParagraphSpacing('<p style="text-align:left"><span style="color:#fff"></span></p>'),
    ).toBe('<p style="text-align:left"><br /></p>');
  });

  it("leaves non-empty paragraphs alone", () => {
    expect(preserveEmptyParagraphSpacing("<p>US: BowlKeyboards</p>")).toBe("<p>US: BowlKeyboards</p>");
  });
});
