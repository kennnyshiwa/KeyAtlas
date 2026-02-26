import { describe, it, expect, beforeEach } from "vitest";
import { rateLimit, RATE_LIMIT_PROJECT_CREATE } from "./rate-limit";

describe("rateLimit", () => {
  const userId = "test-user-rate";
  const endpoint = "test:endpoint";

  // Use a tight config for fast tests
  const config = { limit: 3, window: 60 };

  beforeEach(() => {
    // exhaust any prior state by using a unique user per test isn't needed
    // since we use unique endpoint per test suite run via describe scope
  });

  it("allows requests within the limit", () => {
    const uid = `u-${Date.now()}-allow`;
    expect(rateLimit(uid, endpoint, config)).toBeNull();
    expect(rateLimit(uid, endpoint, config)).toBeNull();
    expect(rateLimit(uid, endpoint, config)).toBeNull();
  });

  it("returns 429 when limit is exceeded", () => {
    const uid = `u-${Date.now()}-block`;
    rateLimit(uid, endpoint, config);
    rateLimit(uid, endpoint, config);
    rateLimit(uid, endpoint, config);

    const result = rateLimit(uid, endpoint, config);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(429);
  });

  it("includes Retry-After header on 429", async () => {
    const uid = `u-${Date.now()}-headers`;
    rateLimit(uid, endpoint, config);
    rateLimit(uid, endpoint, config);
    rateLimit(uid, endpoint, config);

    const result = rateLimit(uid, endpoint, config);
    expect(result!.headers.get("Retry-After")).toBeTruthy();
    expect(result!.headers.get("X-RateLimit-Remaining")).toBe("0");

    const body = await result!.json();
    expect(body.error).toContain("Rate limit exceeded");
  });

  it("isolates different users", () => {
    const uid1 = `u-${Date.now()}-iso1`;
    const uid2 = `u-${Date.now()}-iso2`;
    rateLimit(uid1, endpoint, config);
    rateLimit(uid1, endpoint, config);
    rateLimit(uid1, endpoint, config);

    // uid2 should still have tokens
    expect(rateLimit(uid2, endpoint, config)).toBeNull();
  });

  it("RATE_LIMIT_PROJECT_CREATE is configured for anti-spam", () => {
    expect(RATE_LIMIT_PROJECT_CREATE.limit).toBe(3);
    expect(RATE_LIMIT_PROJECT_CREATE.window).toBe(3600);
  });
});
