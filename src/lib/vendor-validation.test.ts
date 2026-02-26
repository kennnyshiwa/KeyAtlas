import { describe, it, expect } from "vitest";

/**
 * Test the vendor-required-for-GROUP_BUY validation logic.
 * The actual check is inline in the API routes, so we test the pure logic here.
 */
function requiresVendor(status: string, vendorCount: number): string | null {
  if (status === "GROUP_BUY" && vendorCount === 0) {
    return "At least one vendor is required for Group Buy projects.";
  }
  return null;
}

describe("vendor validation by status", () => {
  it("rejects GROUP_BUY with no vendors", () => {
    expect(requiresVendor("GROUP_BUY", 0)).toBe(
      "At least one vendor is required for Group Buy projects."
    );
  });

  it("accepts GROUP_BUY with vendors", () => {
    expect(requiresVendor("GROUP_BUY", 1)).toBeNull();
  });

  it("accepts INTEREST_CHECK with no vendors", () => {
    expect(requiresVendor("INTEREST_CHECK", 0)).toBeNull();
  });

  it("accepts PRODUCTION with no vendors", () => {
    expect(requiresVendor("PRODUCTION", 0)).toBeNull();
  });

  it("accepts COMPLETED with no vendors", () => {
    expect(requiresVendor("COMPLETED", 0)).toBeNull();
  });
});
