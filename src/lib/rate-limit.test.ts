import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  __setRedisClientForTests,
  rateLimit,
  RATE_LIMIT_PROJECT_CREATE,
} from "./rate-limit";

type EvalResult = [number, number, number];

class MockRedis {
  public status = "ready";
  private readonly results: EvalResult[];

  constructor(results: EvalResult[]) {
    this.results = [...results];
  }

  async eval(): Promise<EvalResult> {
    return this.results.shift() ?? [1, 0, 0];
  }

  async connect(): Promise<void> {
    this.status = "ready";
  }

  on(): void {
    // noop
  }
}

describe("rateLimit", () => {
  const endpoint = "test:endpoint";
  const config = { limit: 3, window: 60 };

  beforeEach(() => {
    __setRedisClientForTests(null);
    vi.restoreAllMocks();
    process.env.REDIS_URL = "redis://localhost:6379";
    Object.assign(process.env, { NODE_ENV: "test" });
  });

  it("allows requests within the limit", async () => {
    __setRedisClientForTests(new MockRedis([[1, 2, 0], [1, 1, 0], [1, 0, 0]]) as never);

    const uid = `u-${Date.now()}-allow`;
    await expect(rateLimit(uid, endpoint, config)).resolves.toBeNull();
    await expect(rateLimit(uid, endpoint, config)).resolves.toBeNull();
    await expect(rateLimit(uid, endpoint, config)).resolves.toBeNull();
  });

  it("returns 429 when limit is exceeded", async () => {
    __setRedisClientForTests(new MockRedis([[1, 2, 0], [1, 1, 0], [1, 0, 0], [0, 0, 20]]) as never);

    const uid = `u-${Date.now()}-block`;
    await rateLimit(uid, endpoint, config);
    await rateLimit(uid, endpoint, config);
    await rateLimit(uid, endpoint, config);

    const result = await rateLimit(uid, endpoint, config);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(429);
  });

  it("includes Retry-After header on 429", async () => {
    __setRedisClientForTests(new MockRedis([[1, 2, 0], [1, 1, 0], [1, 0, 0], [0, 0, 19]]) as never);

    const uid = `u-${Date.now()}-headers`;
    await rateLimit(uid, endpoint, config);
    await rateLimit(uid, endpoint, config);
    await rateLimit(uid, endpoint, config);

    const result = await rateLimit(uid, endpoint, config);
    expect(result!.headers.get("Retry-After")).toBe("19");
    expect(result!.headers.get("X-RateLimit-Remaining")).toBe("0");

    const body = await result!.json();
    expect(body.error).toContain("Rate limit exceeded");
  });

  it("fails open with warning in development when Redis errors", async () => {
    Object.assign(process.env, { NODE_ENV: "development" });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    __setRedisClientForTests(
      {
        status: "ready",
        eval: vi.fn().mockRejectedValue(new Error("redis down")),
      } as never
    );

    await expect(rateLimit("user-dev", endpoint, config)).resolves.toBeNull();
    expect(warnSpy).toHaveBeenCalled();
  });

  it("fails open with error log in production when Redis errors", async () => {
    Object.assign(process.env, { NODE_ENV: "production" });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    __setRedisClientForTests(
      {
        status: "ready",
        eval: vi.fn().mockRejectedValue(new Error("redis down")),
      } as never
    );

    await expect(rateLimit("user-prod", endpoint, config)).resolves.toBeNull();
    expect(errorSpy).toHaveBeenCalled();
  });

  it("RATE_LIMIT_PROJECT_CREATE is configured for anti-spam", () => {
    expect(RATE_LIMIT_PROJECT_CREATE.limit).toBe(3);
    expect(RATE_LIMIT_PROJECT_CREATE.window).toBe(3600);
  });
});
