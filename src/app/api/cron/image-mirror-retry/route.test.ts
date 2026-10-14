import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const m = vi.hoisted(() => ({ retry: vi.fn(), counts: vi.fn() }));
vi.mock("@/lib/import/image-mirror-retry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/import/image-mirror-retry")>();
  return {
    clampImageMirrorRetryLimit: actual.clampImageMirrorRetryLimit,
    retryFailedImageMirrors: m.retry,
    getImageMirrorFailureCounts: m.counts,
  };
});
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/meilisearch", () => ({ indexProject: vi.fn() }));

import { GET } from "./route";

const SUMMARY = {
  scanned: 1,
  resolved: 1,
  failed: 0,
  gaveUp: 0,
  unreferenced: 0,
  skipped: 0,
  stoppedEarly: false,
  rewrites: { hero: 1, gallery: 0, description: 0 },
  errors: [],
};

function request(query = "", authorization?: string) {
  return new NextRequest(`https://keyatlas.test/api/cron/image-mirror-retry${query}`, {
    headers: authorization ? { authorization } : {},
  });
}

describe("GET /api/cron/image-mirror-retry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CRON_SECRET", "s3cret");
    m.retry.mockResolvedValue(SUMMARY);
    m.counts.mockResolvedValue({ pending: 3, due: 1, resolved: 5, gaveUp: 2 });
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("returns 401 without a token", async () => {
    expect((await GET(request())).status).toBe(401);
    expect(m.retry).not.toHaveBeenCalled();
  });

  it("returns 401 with a bad token", async () => {
    expect((await GET(request("", "Bearer wrong"))).status).toBe(401);
    expect((await GET(request("", "s3cret"))).status).toBe(401);
    expect(m.retry).not.toHaveBeenCalled();
  });

  it("returns 500 when CRON_SECRET is not configured", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(request("", "Bearer "))).status).toBe(500);
    expect(m.retry).not.toHaveBeenCalled();
  });

  it("runs the retry job and returns the summary with status counts", async () => {
    const response = await GET(request("?limit=7", "Bearer s3cret"));

    expect(response.status).toBe(200);
    expect(m.retry).toHaveBeenCalledWith({ limit: 7 });
    const body = await response.json();
    expect(body).toMatchObject({
      ok: true,
      limit: 7,
      ...SUMMARY,
      counts: { pending: 3, due: 1, resolved: 5, gaveUp: 2 },
    });
  });

  it("clamps the limit", async () => {
    await GET(request("?limit=5000", "Bearer s3cret"));
    await GET(request("?limit=abc", "Bearer s3cret"));
    expect(m.retry.mock.calls.map((call) => call[0].limit)).toEqual([100, 25]);
  });
});
