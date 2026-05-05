import { describe, expect, it } from "vitest";
import { resolveProjectStatusInput } from "@/lib/constants";
import { sanitizeSavedFilterCriteria } from "@/lib/saved-filters";

describe("legacy status input handling", () => {
  it("maps removed status values to supported statuses", () => {
    expect(resolveProjectStatusInput("SHIPPING")).toBe("COMPLETED");
    expect(resolveProjectStatusInput("EXTRAS")).toBe("IN_STOCK");
    expect(resolveProjectStatusInput("ARCHIVED")).toBe("COMPLETED");
  });

  it("returns null for removed shipped-only input", () => {
    expect(resolveProjectStatusInput(undefined)).toBeNull();
  });
});

describe("sanitizeSavedFilterCriteria", () => {
  it("keeps supported criteria and drops removed fields", () => {
    expect(sanitizeSavedFilterCriteria({ status: "IN_STOCK", shipped: true, q: "gmk" })).toEqual({
      status: "IN_STOCK",
      q: "gmk",
    });
  });
});
