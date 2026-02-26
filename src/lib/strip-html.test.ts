import { describe, it, expect } from "vitest";
import { stripHtml } from "./strip-html";

describe("stripHtml", () => {
  it("removes HTML tags", () => {
    expect(stripHtml('<p style="color:red">Hello</p>')).toBe("Hello");
  });

  it("collapses whitespace", () => {
    expect(stripHtml("<p>Hello</p>  <p>World</p>")).toBe("Hello World");
  });

  it("decodes common HTML entities", () => {
    expect(stripHtml("A &amp; B &lt;3&gt; C")).toBe('A & B <3> C');
  });

  it("handles &nbsp;", () => {
    expect(stripHtml("Hello&nbsp;World")).toBe("Hello World");
  });

  it("returns empty string for empty input", () => {
    expect(stripHtml("")).toBe("");
  });

  it("handles nested tags", () => {
    expect(stripHtml("<div><p><strong>Bold</strong> text</p></div>")).toBe(
      "Bold text"
    );
  });
});
