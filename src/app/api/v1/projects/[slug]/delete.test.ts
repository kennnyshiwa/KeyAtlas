import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const m = vi.hoisted(() => ({ session: vi.fn(), key: vi.fn(), keyUpdate: vi.fn(), user: vi.fn(), project: vi.fn(), transaction: vi.fn(), delete: vi.fn(), follows: vi.fn(), watchlist: vi.fn(), search: vi.fn(), rate: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: m.session }));
// Exercise the REAL bearer validation, including hash, expiry and revocation.
vi.mock("@/lib/prisma", () => ({ prisma: { apiKey: { findUnique: m.key, update: m.keyUpdate }, user: { findUnique: m.user }, project: { findFirst: m.project }, $transaction: m.transaction } }));
vi.mock("@/lib/meilisearch", () => ({ indexProject: vi.fn(), removeProjectFromIndex: m.search }));
vi.mock("@/lib/notifications/watchlist", () => ({ notifyWatchlistMatches: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: m.rate, RATE_LIMIT_DETAIL: {}, RATE_LIMIT_PROJECT_UPDATE: {} }));
import { DELETE } from "./route";
const invoke = (authorization?: string) => DELETE(new NextRequest("https://keyatlas.test/api/v1/projects/draft", { method: "DELETE", headers: authorization === undefined ? {} : { authorization } }), { params: Promise.resolve({ slug: "draft" }) });
describe("v1 draft DELETE", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.session.mockResolvedValue(null); m.key.mockResolvedValue({ id: "key", user: { id: "owner" }, revoked: false, expiresAt: null }); m.keyUpdate.mockResolvedValue({});
    m.user.mockResolvedValue({ role: "USER" }); m.project.mockResolvedValue({ id: "draft-id", creatorId: "owner", published: false }); m.rate.mockResolvedValue(null);
    m.delete.mockResolvedValue({ count: 1 }); m.follows.mockResolvedValue({ count: 1 }); m.watchlist.mockResolvedValue({ count: 1 });
    m.transaction.mockImplementation(async (fn) => fn({ project: { deleteMany: m.delete }, follow: { deleteMany: m.follows }, watchlistNotification: { deleteMany: m.watchlist } }));
  });
  it.each([undefined, "Basic abc", "Bearer wrong", "Bearer kv_unknown"])("rejects absent/invalid auth %s before project lookup", async (header) => {
    m.key.mockResolvedValue(null);
    expect((await invoke(header)).status).toBe(401); expect(m.project).not.toHaveBeenCalled(); expect(m.transaction).not.toHaveBeenCalled();
  });
  it.each([{ revoked: true }, { expiresAt: new Date(0) }])("rejects revoked/expired keys", async (invalid) => {
    m.key.mockResolvedValue({ id: "key", user: { id: "owner" }, ...invalid });
    expect((await invoke("Bearer kv_test")).status).toBe(401); expect(m.delete).not.toHaveBeenCalled();
  });
  it("does not fall back to a cookie when an explicit bearer is invalid", async () => {
    m.session.mockResolvedValue({ user: { id: "owner" } });
    expect((await invoke("Bearer invalid")).status).toBe(401); expect(m.session).not.toHaveBeenCalled();
  });
  it("accepts an authenticated browser session and rechecks its DB role", async () => {
    m.session.mockResolvedValue({ user: { id: "owner", role: "ADMIN" } });
    expect((await invoke()).status).toBe(200); expect(m.delete).toHaveBeenCalledWith({ where: { id: "draft-id", published: false, creatorId: "owner" } });
  });
  it("returns decodable JSON and cleans legacy references before search removal", async () => {
    const response = await invoke("Bearer kv_test"); expect(response.status).toBe(200); expect(await response.json()).toEqual({ success: true });
    expect(m.key.mock.calls[0][0].where.key).toMatch(/^[a-f0-9]{64}$/);
    expect(m.delete).toHaveBeenCalledWith({ where: { id: "draft-id", published: false, creatorId: "owner" } });
    expect(m.follows).toHaveBeenCalledWith({ where: { targetType: "PROJECT", targetId: "draft-id" } });
    expect(m.watchlist).toHaveBeenCalledWith({ where: { projectId: "draft-id" } });
    expect(m.search).toHaveBeenCalledWith("draft-id");
    expect(m.search.mock.invocationCallOrder[0]).toBeGreaterThan(m.watchlist.mock.invocationCallOrder[0]);
  });
  it.each(["USER", "MODERATOR"])("rejects a nonowner %s", async (role) => {
    m.user.mockResolvedValue({ role }); m.project.mockResolvedValue({ id: "draft-id", creatorId: "another", published: false });
    expect((await invoke("Bearer kv_test")).status).toBe(403); expect(m.delete).not.toHaveBeenCalled();
  });
  it("allows an admin to delete another owner's draft", async () => {
    m.user.mockResolvedValue({ role: "ADMIN" });
    expect((await invoke("Bearer kv_test")).status).toBe(200); expect(m.delete).toHaveBeenCalledWith({ where: { id: "draft-id", published: false } });
  });
  it.each(["USER", "ADMIN"])("forbids published projects even for %s", async (role) => {
    m.user.mockResolvedValue({ role }); m.project.mockResolvedValue({ id: "draft-id", creatorId: "owner", published: true });
    expect((await invoke("Bearer kv_test")).status).toBe(403); expect(m.transaction).not.toHaveBeenCalled(); expect(m.search).not.toHaveBeenCalled();
  });
  it("returns 404 for an authenticated missing draft", async () => { m.project.mockResolvedValue(null); expect((await invoke("Bearer kv_test")).status).toBe(404); });
  it("does not clean anything when concurrent publication/ownership change wins", async () => {
    m.delete.mockResolvedValue({ count: 0 }); expect((await invoke("Bearer kv_test")).status).toBe(409); expect(m.follows).not.toHaveBeenCalled(); expect(m.search).not.toHaveBeenCalled();
  });
  it("does not remove search when transaction cleanup fails", async () => {
    m.watchlist.mockRejectedValueOnce(new Error("database unavailable")); await expect(invoke("Bearer kv_test")).rejects.toThrow("database unavailable"); expect(m.search).not.toHaveBeenCalled();
  });
});
