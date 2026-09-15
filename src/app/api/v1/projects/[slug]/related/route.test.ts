import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("@/lib/prisma", () => ({ prisma: {
  project: { findFirst: vi.fn(), findMany: vi.fn() }, follow: { groupBy: vi.fn() },
} }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn(), RATE_LIMIT_LIST: { limit: 20, window: 60 } }));
vi.mock("@/lib/api-auth", () => ({ authenticateApiKey: vi.fn(() => { throw new Error("No auth on public related cards"); }) }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn(() => { throw new Error("No session on public related cards"); }) }));
import { prisma } from "@/lib/prisma";
import { rateLimit, RATE_LIMIT_LIST } from "@/lib/rate-limit";
import { authenticateApiKey } from "@/lib/api-auth";
import { auth } from "@/lib/auth";
import { GET } from "./route";

const context = { params: Promise.resolve({ slug: "missing" }) };
describe("anonymous related GET boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(rateLimit).mockResolvedValue(null);
    vi.mocked(prisma.project.findFirst).mockResolvedValue(null);
  });
  it.each<Record<string, string>>([{}, { authorization: "Bearer kv_unused", cookie: "unused=session" }])("does not authenticate or load sessions (%j)", async (headers) => {
    const response = await GET(new NextRequest("http://localhost/api/v1/projects/missing/related", { headers }), context);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Not found" });
    expect(authenticateApiKey).not.toHaveBeenCalled(); expect(auth).not.toHaveBeenCalled();
    expect(prisma.project.findMany).not.toHaveBeenCalled(); expect(prisma.follow.groupBy).not.toHaveBeenCalled();
  });
  it.each([undefined, "192.0.2.8"])('rate-limits with IP/anon before resolving params or querying (%s)', async (ip) => {
    const limited = NextResponse.json({ error: "Rate limit exceeded. Try again later." }, {
      status: 429, headers: { "Retry-After": "3", "X-RateLimit-Limit": "20", "X-RateLimit-Remaining": "0" },
    });
    vi.mocked(rateLimit).mockResolvedValue(limited);
    const req = new NextRequest("http://localhost/api/v1/projects/missing/related", { headers: ip ? { "x-forwarded-for": ip } : {} });
    const response = await GET(req, { params: new Promise<{ slug: string }>(() => {}) });
    expect(response).toBe(limited); expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("3");
    expect(rateLimit).toHaveBeenCalledExactlyOnceWith(ip ?? "anon", "v1:projects:related", RATE_LIMIT_LIST);
    expect(prisma.project.findFirst).not.toHaveBeenCalled(); expect(prisma.project.findMany).not.toHaveBeenCalled();
    expect(prisma.follow.groupBy).not.toHaveBeenCalled(); expect(authenticateApiKey).not.toHaveBeenCalled();
  });
});
