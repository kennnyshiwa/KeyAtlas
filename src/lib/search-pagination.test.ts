import { describe, expect, it } from "vitest";
import { resolveSearchTotal } from "./search-pagination";

describe("resolveSearchTotal", () => {
  it("reports the engine-wide match total, not the current page length", () => {
    // The live regression: 300 matches, 20 returned, total was reported as 20.
    expect(resolveSearchTotal({ estimatedTotalHits: 300 }, 0, 20)).toBe(300);
  });

  it("prefers the exact totalHits count when the engine supplies it", () => {
    expect(resolveSearchTotal({ totalHits: 42, estimatedTotalHits: 40 }, 0, 10)).toBe(42);
  });

  it("never reports a total below what the requested page already exposes", () => {
    expect(resolveSearchTotal({ estimatedTotalHits: 0 }, 15, 5)).toBe(20);
    expect(resolveSearchTotal(undefined, 40, 10)).toBe(50);
    expect(resolveSearchTotal({}, 0, 0)).toBe(0);
  });

  it("ignores non-finite or negative engine totals", () => {
    expect(resolveSearchTotal({ estimatedTotalHits: Number.NaN }, 0, 3)).toBe(3);
    expect(resolveSearchTotal({ estimatedTotalHits: Number.POSITIVE_INFINITY }, 0, 3)).toBe(3);
    expect(resolveSearchTotal({ totalHits: -5 }, 0, 3)).toBe(3);
  });
});
