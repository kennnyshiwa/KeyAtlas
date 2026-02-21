import { NextResponse } from "next/server";

interface RateLimitEntry {
  tokens: number;
  lastRefill: number;
}

const buckets = new Map<string, RateLimitEntry>();

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of buckets) {
    if (now - entry.lastRefill > 600_000) {
      buckets.delete(key);
    }
  }
}, 300_000);

interface RateLimitConfig {
  /** Max requests in the window */
  limit: number;
  /** Window size in seconds */
  window: number;
}

/**
 * Token-bucket rate limiter keyed by userId + endpoint identifier.
 * Returns null if allowed, or a 429 NextResponse if rate limited.
 */
export function rateLimit(
  userId: string,
  endpoint: string,
  config: RateLimitConfig
): NextResponse | null {
  const key = `${userId}:${endpoint}`;
  const now = Date.now();
  const entry = buckets.get(key);

  if (!entry) {
    buckets.set(key, { tokens: config.limit - 1, lastRefill: now });
    return null;
  }

  // Refill tokens based on elapsed time
  const elapsed = (now - entry.lastRefill) / 1000;
  const refillRate = config.limit / config.window;
  entry.tokens = Math.min(config.limit, entry.tokens + elapsed * refillRate);
  entry.lastRefill = now;

  if (entry.tokens < 1) {
    const retryAfter = Math.ceil((1 - entry.tokens) / refillRate);
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfter),
          "X-RateLimit-Limit": String(config.limit),
          "X-RateLimit-Remaining": "0",
        },
      }
    );
  }

  entry.tokens -= 1;
  return null;
}

// -------------------------------------------------------------------
// Pre-defined rate limit tiers
// -------------------------------------------------------------------

/** Frequently polled — 30 req/min */
export const RATE_LIMIT_LATEST: RateLimitConfig = { limit: 30, window: 60 };

/** Standard list/search — 20 req/min */
export const RATE_LIMIT_LIST: RateLimitConfig = { limit: 20, window: 60 };

/** Single-resource detail — 30 req/min */
export const RATE_LIMIT_DETAIL: RateLimitConfig = { limit: 30, window: 60 };

/** Slow-changing reference data (vendors, designers, categories) — 10 req/min */
export const RATE_LIMIT_REFERENCE: RateLimitConfig = { limit: 10, window: 60 };

/** API key management (create/list/revoke) — 5 req/min */
export const RATE_LIMIT_KEY_MGMT: RateLimitConfig = { limit: 5, window: 60 };
