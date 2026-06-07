import { describe, expect, it } from "vitest";
import {
  preserveEmptyParagraphSpacing,
  sanitizeRichText,
} from "@/components/editor/rich-text-renderer";
import { normalizeCollapsibleSections } from "@/components/editor/collapsible-html";

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

describe("sanitizeRichText", () => {
  it("preserves collapsible sections", () => {
    const html = sanitizeRichText(
      '<details data-collapsible="true"><summary>Older IC details</summary><div data-collapsible-content="true"><p>Round 1 vendors</p></div></details>',
    );

    expect(html).toContain('<details data-collapsible="true" class="ka-collapsible-section">');
    expect(html).toContain('<summary class="ka-collapsible-summary">Older IC details</summary>');
    expect(html).toContain('<div data-collapsible-content="true">');
  });
});

describe("normalizeCollapsibleSections", () => {
  it("adds a content wrapper inside details when one is missing", () => {
    const html = normalizeCollapsibleSections(
      "<details><summary>Specs</summary><p>Plate: Aluminum</p><p>Mount: Top</p></details>",
    );

    expect(html).toContain(
      '<details><summary>Specs</summary><div data-collapsible-content="true"><p>Plate: Aluminum</p><p>Mount: Top</p></div></details>',
    );
  });
});
