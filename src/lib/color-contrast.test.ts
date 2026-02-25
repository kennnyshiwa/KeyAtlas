import { describe, it, expect } from "vitest";
import {
  parseHex,
  relativeLuminance,
  contrastRatio,
  passesWcagAA,
  WCAG_AA_THRESHOLD,
} from "./color-contrast";

describe("parseHex", () => {
  it("parses 6-digit hex", () => {
    expect(parseHex("#ff0000")).toEqual([255, 0, 0]);
    expect(parseHex("00ff00")).toEqual([0, 255, 0]);
  });

  it("parses 3-digit hex", () => {
    expect(parseHex("#fff")).toEqual([255, 255, 255]);
    expect(parseHex("000")).toEqual([0, 0, 0]);
  });

  it("returns null for invalid", () => {
    expect(parseHex("xyz")).toBeNull();
    expect(parseHex("#12345")).toBeNull();
    expect(parseHex("")).toBeNull();
  });
});

describe("contrastRatio", () => {
  it("black on white is 21:1", () => {
    const ratio = contrastRatio("#000000", "#ffffff");
    expect(ratio).toBeCloseTo(21, 0);
  });

  it("same colour is 1:1", () => {
    expect(contrastRatio("#abcdef", "#abcdef")).toBeCloseTo(1, 1);
  });

  it("returns null for invalid input", () => {
    expect(contrastRatio("nope", "#fff")).toBeNull();
  });
});

describe("passesWcagAA", () => {
  it("black on white passes", () => {
    expect(passesWcagAA("#000", "#fff")).toBe(true);
  });

  it("light gray on white fails", () => {
    // #ccc on white ~ 1.6:1
    expect(passesWcagAA("#cccccc", "#ffffff")).toBe(false);
  });

  it("default editor color (#374151) on white passes", () => {
    expect(passesWcagAA("#374151", "#ffffff")).toBe(true);
  });
});
