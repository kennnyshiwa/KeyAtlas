import { NextResponse } from "next/server";
import Redis from "ioredis";

interface RateLimitConfig {
  /** Max requests in the window */
  limit: number;
  /** Window size in seconds */
  window: number;
}

type RedisEvalResult = [number, number, number];

const RATE_LIMIT_KEY_PREFIX = "rate-limit";

const RATE_LIMIT_LUA = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local window = tonumber(ARGV[3])

local data = redis.call("HMGET", key, "tokens", "lastRefill")
local tokens = tonumber(data[1])
local lastRefill = tonumber(data[2])

if tokens == nil or lastRefill == nil then
  tokens = limit
  lastRefill = now
end

local refillRate = limit / window
local elapsed = math.max(0, now - lastRefill)
tokens = math.min(limit, tokens + (elapsed * refillRate))

local allowed = 0
if tokens >= 1 then
  tokens = tokens - 1
  allowed = 1
end

redis.call("HMSET", key, "tokens", tokens, "lastRefill", now)
redis.call("EXPIRE", key, math.ceil(window * 2))

local remaining = math.floor(tokens)
if remaining < 0 then
  remaining = 0
end

local retryAfter = 0
if allowed == 0 then
  retryAfter = math.ceil((1 - tokens) / refillRate)
  if retryAfter < 1 then
    retryAfter = 1
  end
end

return { allowed, remaining, retryAfter }
`;

let redisClient: Redis | null = null;
let redisUnavailableLogged = false;

function getRedisClient(): Redis | null {
  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    return null;
  }

  if (!redisClient) {
    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      enableOfflineQueue: false,
    });

    redisClient.on("error", (error) => {
      if (!redisUnavailableLogged) {
        redisUnavailableLogged = true;
        console.error("[rate-limit] Redis unavailable. Failing open.", error);
      }
    });
  }

  return redisClient;
}

function buildRateLimitResponse(config: RateLimitConfig, retryAfter: number): NextResponse {
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

function handleRedisUnavailable(error: unknown): null {
  const isProduction = process.env.NODE_ENV === "production";

  if (isProduction) {
    console.error("[rate-limit] Redis check failed in production. Allowing request.", error);
  } else {
    console.warn("[rate-limit] Redis check failed in development. Allowing request.", error);
  }

  return null;
}

/**
 * Token-bucket rate limiter keyed by userId + endpoint identifier.
 * Returns null if allowed, or a 429 NextResponse if rate limited.
 */
export async function rateLimit(
  userId: string,
  endpoint: string,
  config: RateLimitConfig,
  options?: { skipIfAdmin?: boolean }
): Promise<NextResponse | null> {
  if (options?.skipIfAdmin) return null;
  const redis = getRedisClient();

  if (!redis) {
    return null;
  }

  const key = `${RATE_LIMIT_KEY_PREFIX}:${userId}:${endpoint}`;
  const nowSeconds = Date.now() / 1000;

  try {
    if (redis.status === "wait") {
      await redis.connect();
    }

    const [allowed, remaining, retryAfter] = (await redis.eval(
      RATE_LIMIT_LUA,
      1,
      key,
      nowSeconds,
      config.limit,
      config.window
    )) as RedisEvalResult;

    if (allowed === 1) {
      return null;
    }

    return NextResponse.json(
      { error: "Rate limit exceeded. Try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfter),
          "X-RateLimit-Limit": String(config.limit),
          "X-RateLimit-Remaining": String(remaining),
        },
      }
    );
  } catch (error) {
    return handleRedisUnavailable(error);
  }
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

/** Forum thread creation — 3 threads / 15 minutes */
export const RATE_LIMIT_FORUM_THREAD_CREATE: RateLimitConfig = {
  limit: 3,
  window: 900,
};

/** Forum post creation — 12 posts / 5 minutes */
export const RATE_LIMIT_FORUM_POST_CREATE: RateLimitConfig = {
  limit: 12,
  window: 300,
};

/** Project creation — 3 projects / hour (anti-spam) */
export const RATE_LIMIT_PROJECT_CREATE: RateLimitConfig = {
  limit: 3,
  window: 3600,
};

/** Project update — 20 updates / 15 minutes */
export const RATE_LIMIT_PROJECT_UPDATE: RateLimitConfig = {
  limit: 20,
  window: 900,
};

/** Project report — 5 reports / hour */
export const RATE_LIMIT_PROJECT_REPORT: RateLimitConfig = {
  limit: 5,
  window: 3600,
};

/** Comment creation — 10 comments / 5 minutes */
export const RATE_LIMIT_COMMENT_CREATE: RateLimitConfig = {
  limit: 10,
  window: 300,
};

/** Follow/unfollow — 30 actions / 5 minutes */
export const RATE_LIMIT_FOLLOW: RateLimitConfig = {
  limit: 30,
  window: 300,
};

/** Guide creation — 3 guides / hour */
export const RATE_LIMIT_GUIDE_CREATE: RateLimitConfig = {
  limit: 3,
  window: 3600,
};

/** Sound test creation — 10 / hour */
export const RATE_LIMIT_SOUND_TEST_CREATE: RateLimitConfig = {
  limit: 10,
  window: 3600,
};

/** Project update creation — 10 / hour */
export const RATE_LIMIT_PROJECT_UPDATE_CREATE: RateLimitConfig = {
  limit: 10,
  window: 3600,
};

/** Signup — 5 attempts / 15 minutes per IP */
export const RATE_LIMIT_SIGNUP: RateLimitConfig = {
  limit: 5,
  window: 900,
};

export type { RateLimitConfig };

export function __setRedisClientForTests(client: Redis | null): void {
  redisClient = client;
  redisUnavailableLogged = false;
}
