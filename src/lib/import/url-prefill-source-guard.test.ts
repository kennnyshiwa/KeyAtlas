import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ fetch: vi.fn(), mirror: vi.fn() }));
vi.mock("@/lib/security/ssrf-guard", () => ({ safeFetch: m.fetch }));
vi.mock("@/lib/import/imgur-mirror", () => ({ mirrorPrefillImages: m.mirror, mirrorImgurImageSrcsInHtml: async (s: string) => s }));
import { importUrlPrefill } from "./url-prefill";
const source = "https://swagkeys.notion.site/Heartbreaker-c47f75d53601832db46301eebc13e323";
function page(title: string, url = source) { m.fetch.mockResolvedValue({ ok: true, url, text: async () => `<title>Notion</title><meta property="og:title" content="${title}"><article>Project details</article>` }); }
describe("verified Notion source corruption guard", () => {
  beforeEach(() => { vi.clearAllMocks(); m.mirror.mockImplementation(async (images) => images); });
  it.each(["Notion | Where teams and agents work together", "Notion"])("rejects generic Notion metadata %s before importing any media", async (title) => {
    page(title); await expect(importUrlPrefill(source)).rejects.toThrow("generic site metadata"); expect(m.mirror).not.toHaveBeenCalled();
  });
  it("allows real Notion document metadata", async () => {
    page("SWG Heartbreaker | 20 July - 3 Aug 2026"); const result = await importUrlPrefill(source);
    expect(result.title).toBe("SWG Heartbreaker | 20 July - 3 Aug 2026"); expect(result).not.toHaveProperty("slug");
  });
  it("does not blacklist the same title on unrelated hosts", async () => {
    page("Notion", "https://vendor.example/notion"); expect((await importUrlPrefill("https://vendor.example/notion")).title).toBe("Notion");
  });
  it("recognizes a redirect to generic Notion metadata", async () => {
    page("Notion | Where teams and agents work together", "https://www.notion.so/"); await expect(importUrlPrefill("https://vendor.example/roadmap")).rejects.toThrow("generic site metadata");
  });
});
