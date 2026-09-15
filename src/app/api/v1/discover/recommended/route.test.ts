import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
const m = vi.hoisted(() => ({
  user: { id: "alice" } as { id: string } | null,
  project: { findMany: vi.fn(), count: vi.fn() },
  follow: { findMany: vi.fn(), findFirst: vi.fn(), groupBy: vi.fn() },
  favorite: { findMany: vi.fn() }, userCollection: { findMany: vi.fn() }, rate: vi.fn(), auth: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: m }));
vi.mock("@/lib/api-auth", () => ({ authenticateApiKey: m.auth }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: m.rate, RATE_LIMIT_LIST: {} }));
import { GET as recommended } from "./route";
import { GET as list } from "../../projects/route";
const req = () => new NextRequest("http://localhost/api/v1/projects?page_size=2");
function card(id: string) { return { id, title: id, slug: id, category: "KEYCAPS", status: "GROUP_BUY", profiles: [], tags: [],
  _count: { favorites: 0, comments: 0, followers: 0, updates: 0 }, createdAt: new Date(), updatedAt: new Date() }; }
beforeEach(() => {
  vi.resetAllMocks(); m.auth.mockImplementation(async () => m.user); m.user = { id: "alice" }; m.rate.mockResolvedValue(null);
  m.project.findMany.mockResolvedValue([card("p1"), card("p2")]); m.project.count.mockResolvedValue(3);
  m.follow.groupBy.mockResolvedValue([]); m.follow.findMany.mockResolvedValue([{ targetId: "p1" }]);
  m.favorite.findMany.mockResolvedValue([{ projectId: "p2" }]); m.userCollection.findMany.mockResolvedValue([{ projectId: "p1" }]);
});
describe("production GET query boundaries and cache policy", () => {
  it("batches exactly three viewer queries bounded to returned page IDs", async () => {
    const res = await list(req()); const body = await res.json();
    expect(m.follow.findMany).toHaveBeenCalledExactlyOnceWith({ where: { userId: "alice", targetType: "PROJECT", targetId: { in: ["p1", "p2"] } }, select: { targetId: true } });
    for (const model of [m.favorite, m.userCollection]) expect(model.findMany).toHaveBeenCalledExactlyOnceWith({ where: { userId: "alice", projectId: { in: ["p1", "p2"] } }, select: { projectId: true } });
    expect(body.data.map((p: Record<string, boolean>) => [p.is_following, p.is_favorited, p.is_in_collection])).toEqual([[true, false, true], [false, true, false]]);
    expect(body).toMatchObject({ total: 3, page: 1, page_size: 2, has_more: true });
    expect(res.headers.get("cache-control")).toBe("private, no-store"); expect(res.headers.get("vary")).toBe("Authorization, Cookie");
  });
  it.each(["anonymous", "empty"])("does not query viewer tables on %s pages", async (kind) => {
    if (kind === "anonymous") m.user = null; else m.project.findMany.mockResolvedValue([]);
    const body = await (await list(req())).json();
    for (const model of [m.follow, m.favorite, m.userCollection]) expect(model.findMany).not.toHaveBeenCalled();
    for (const p of body.data) expect([p.is_following, p.is_favorited, p.is_in_collection]).toEqual([false, false, false]);
  });
  it("requires authentication before accessing recommendation data", async () => {
    m.user = null; const res = await recommended(req());
    expect(res.status).toBe(401); expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(m.project.findMany).not.toHaveBeenCalled(); expect(m.follow.findFirst).not.toHaveBeenCalled();
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });
  it("keeps full scorer/update ties in stable candidate input order", async () => {
    const a = card("z"), b = { ...a, id: "a" };
    m.follow.findFirst.mockResolvedValue({ targetProject: { ...a, id: "anchor" } });
    m.follow.findMany.mockResolvedValue([]); m.project.findMany.mockResolvedValue([a, b]);
    const body = await (await recommended(req())).json(); expect(body.data.map((p: { id: string }) => p.id)).toEqual(["z", "a"]);
    expect(m.project.findMany.mock.calls[0][0]).toMatchObject({ where: { published: true }, take: 48, orderBy: { updatedAt: "desc" } });
  });
  it.each([list, recommended])("marks rate-limit responses private too", async (get) => {
    m.rate.mockResolvedValue(NextResponse.json({ error: "limited" }, { status: 429 }));
    const res = await get(req()); expect(res.status).toBe(429); expect(res.headers.get("cache-control")).toBe("private, no-store");
  });
});


describe("sanitized private error responses", () => {
  it.each([list, recommended])("contains query and serializer failures", async (get) => {
    m.follow.findFirst.mockResolvedValue({ targetProject: card("anchor") });
    for (const failing of [m.project.findMany, m.follow.groupBy, m.favorite.findMany]) {
      failing.mockRejectedValueOnce(new Error("private database credential/SQL detail"));
      const res = await get(new NextRequest("http://localhost/api/v1/projects?category=INVALID"));
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: "Internal server error" });
      expect(res.headers.get("content-type")).toContain("application/json");
      expect(res.headers.get("cache-control")).toBe("private, no-store");
      expect(res.headers.get("vary")).toBe("Authorization, Cookie");
    }
  });
  it.each([list, recommended])("contains thrown rate limiter failures", async (get) => {
    m.rate.mockRejectedValueOnce(new Error("private redis detail"));
    const res = await get(req());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Internal server error" });
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("vary")).toBe("Authorization, Cookie");
  });
  it("contains recommendation auth exceptions and preserves list's anonymous fallback", async () => {
    m.auth.mockRejectedValue(new Error("private auth detail"));
    const res = await recommended(req());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Internal server error" });
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("vary")).toBe("Authorization, Cookie");
    const publicResponse = await list(req());
    expect(publicResponse.status).toBe(200);
    expect((await publicResponse.json()).data.every((p: { is_following: boolean }) => !p.is_following)).toBe(true);
  });
});
