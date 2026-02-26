import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { verifyTurnstile } from "./turnstile";

describe("verifyTurnstile", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("allows in development when secret key is not configured", async () => {
    delete process.env.TURNSTILE_SECRET_KEY;
    process.env.NODE_ENV = "development";
    const result = await verifyTurnstile("any-token");
    expect(result.success).toBe(true);
  });

  it("rejects in production when secret key is not configured", async () => {
    delete process.env.TURNSTILE_SECRET_KEY;
    process.env.NODE_ENV = "production";
    const result = await verifyTurnstile("any-token");
    expect(result.success).toBe(false);
    expect(result.error).toContain("not configured");
  });

  it("rejects when no token provided", async () => {
    process.env.TURNSTILE_SECRET_KEY = "test-secret";
    const result = await verifyTurnstile(null);
    expect(result.success).toBe(false);
    expect(result.error).toContain("token required");
  });

  it("calls Cloudflare API and returns success", async () => {
    process.env.TURNSTILE_SECRET_KEY = "test-secret";
    const mockFetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ success: true }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await verifyTurnstile("valid-token", "1.2.3.4");
    expect(result.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it("returns failure on Cloudflare rejection", async () => {
    process.env.TURNSTILE_SECRET_KEY = "test-secret";
    const mockFetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ success: false, "error-codes": ["invalid-input-response"] }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await verifyTurnstile("bad-token");
    expect(result.success).toBe(false);
  });

  it("handles fetch error gracefully", async () => {
    process.env.TURNSTILE_SECRET_KEY = "test-secret";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));

    const result = await verifyTurnstile("token");
    expect(result.success).toBe(false);
    expect(result.error).toContain("unavailable");
  });
});
