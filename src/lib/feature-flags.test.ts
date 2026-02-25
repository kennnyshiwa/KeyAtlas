import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("REQUIRE_PROJECT_REVIEW feature flag", () => {
  const originalEnv = process.env.REQUIRE_PROJECT_REVIEW;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.REQUIRE_PROJECT_REVIEW;
    } else {
      process.env.REQUIRE_PROJECT_REVIEW = originalEnv;
    }
    vi.resetModules();
  });

  it("defaults to false when env is unset", async () => {
    delete process.env.REQUIRE_PROJECT_REVIEW;
    const { REQUIRE_PROJECT_REVIEW } = await import("@/lib/feature-flags");
    expect(REQUIRE_PROJECT_REVIEW).toBe(false);
  });

  it('is true when env is "true"', async () => {
    process.env.REQUIRE_PROJECT_REVIEW = "true";
    const { REQUIRE_PROJECT_REVIEW } = await import("@/lib/feature-flags");
    expect(REQUIRE_PROJECT_REVIEW).toBe(true);
  });

  it('is false when env is "false"', async () => {
    process.env.REQUIRE_PROJECT_REVIEW = "false";
    const { REQUIRE_PROJECT_REVIEW } = await import("@/lib/feature-flags");
    expect(REQUIRE_PROJECT_REVIEW).toBe(false);
  });
});
