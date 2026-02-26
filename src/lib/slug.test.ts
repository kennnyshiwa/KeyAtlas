import { describe, it, expect } from "vitest";
import { slugify, isSlugSafe } from "./slug";

describe("slugify", () => {
  it("converts basic text to slug", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("handles accented characters by stripping diacritics", () => {
    expect(slugify("Café résumé")).toBe("cafe-resume");
  });

  it("strips Chinese characters entirely", () => {
    expect(slugify("键帽项目")).toBe("");
  });

  it("strips Japanese characters entirely", () => {
    expect(slugify("キーキャップ")).toBe("");
  });

  it("strips Korean characters entirely", () => {
    expect(slugify("키캡")).toBe("");
  });

  it("handles mixed ASCII and CJK", () => {
    expect(slugify("GMK 奥利弗 Oliver")).toBe("gmk-oliver");
  });

  it("handles punctuation and special characters", () => {
    expect(slugify("Hello! @World #2024")).toBe("hello-world-2024");
  });

  it("collapses multiple hyphens", () => {
    expect(slugify("a---b")).toBe("a-b");
  });

  it("trims leading and trailing hyphens", () => {
    expect(slugify("--hello--")).toBe("hello");
  });

  it("handles unicode dashes", () => {
    expect(slugify("one–two—three")).toBe("one-two-three");
  });

  it("respects maxLen", () => {
    expect(slugify("a".repeat(200), 10)).toBe("a".repeat(10));
  });

  it("handles empty string", () => {
    expect(slugify("")).toBe("");
  });

  it("handles string with only Unicode", () => {
    expect(slugify("🎹🎨")).toBe("");
  });

  it("handles spaces and underscores", () => {
    expect(slugify("hello_world test")).toBe("hello-world-test");
  });
});

describe("isSlugSafe", () => {
  it("accepts valid slug", () => {
    expect(isSlugSafe("gmk-oliver-2024")).toBe(true);
  });

  it("rejects slug with unicode", () => {
    expect(isSlugSafe("gmk-奥利弗")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isSlugSafe("")).toBe(false);
  });

  it("rejects slug with leading hyphen", () => {
    expect(isSlugSafe("-hello")).toBe(false);
  });

  it("rejects slug with consecutive hyphens", () => {
    expect(isSlugSafe("hello--world")).toBe(false);
  });
});
