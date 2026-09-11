import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const m = vi.hoisted(() => ({ auth: vi.fn(), api: vi.fn(), create: vi.fn(), findUnique: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: m.auth }));
vi.mock("@/lib/api-auth", () => ({ authenticateApiKey: m.api }));
vi.mock("@/lib/prisma", () => ({ prisma: { project: { create: m.create, findUnique: m.findUnique } } }));
vi.mock("@/lib/meilisearch", () => ({ indexProject: vi.fn() }));
vi.mock("@/lib/notifications/watchlist", () => ({ notifyWatchlistMatches: vi.fn(async () => {}) }));
vi.mock("@/lib/designer-profiles", () => ({ normalizeDesignerName: () => null, resolveDesignerIdByName: async () => null }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn(async () => null), RATE_LIMIT_PROJECT_CREATE: {} }));
import { POST } from "./route";
function request(body = {}) { return new NextRequest("https://keyatlas.test/api/projects?intent=draft", { method: "POST", body: JSON.stringify(body) }); }
const payload = { title: "Mobile submission", slug: "mobile-submission", category: "KEYCAPS", status: "INTEREST_CHECK", images: [{ url: "https://example.com/kit.png", order: 0 }] };
describe("project creation authentication", () => {
 beforeEach(() => { vi.clearAllMocks(); m.api.mockResolvedValue(null); m.auth.mockResolvedValue(null); m.findUnique.mockResolvedValue(null); m.create.mockImplementation(async ({data}) => ({id:"project-id", ...data})); });
 it("accepts a valid mobile bearer identity and saves its gallery and creator", async () => {
  m.api.mockResolvedValue({id:"mobile-user", role:"USER"});
  const response = await POST(request(payload));
  expect(response.status).toBe(201); expect(m.auth).not.toHaveBeenCalled();
  expect(m.create.mock.calls[0][0].data).toMatchObject({creatorId:"mobile-user", published:false, featured:false, images:{create:[expect.objectContaining({url:"https://example.com/kit.png"})]}});
 });
 it("preserves browser-session creation", async () => {
  m.auth.mockResolvedValue({user:{id:"web-user",role:"USER"}});
  expect((await POST(request(payload))).status).toBe(201);
  expect(m.create.mock.calls[0][0].data.creatorId).toBe("web-user");
 });
 it("rejects missing or invalid credentials before writing", async () => {
  expect((await POST(request(payload))).status).toBe(403); expect(m.create).not.toHaveBeenCalled();
 });
 it("still validates authenticated mobile payloads", async () => {
  m.api.mockResolvedValue({id:"mobile-user",role:"USER"});
  expect((await POST(request())).status).toBe(400); expect(m.create).not.toHaveBeenCalled();
 });
});
