import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const m = vi.hoisted(() => ({ api: vi.fn(), findFirst: vi.fn(), previous: vi.fn(), user: vi.fn(), update: vi.fn(), transaction: vi.fn(), images: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/api-auth", () => ({ authenticateApiKey: m.api }));
vi.mock("@/lib/prisma", () => ({ prisma: { project: { findFirst:m.findFirst, findUnique:m.previous }, user:{findUnique:m.user}, $transaction:m.transaction } }));
vi.mock("@/lib/meilisearch", () => ({indexProject:vi.fn(),removeProjectFromIndex:vi.fn()}));
vi.mock("@/lib/notifications/watchlist", () => ({notifyWatchlistMatches:vi.fn()}));
vi.mock("@/lib/rate-limit", () => ({rateLimit:vi.fn(async()=>null),RATE_LIMIT_DETAIL:{},RATE_LIMIT_PROJECT_UPDATE:{}}));
import { PATCH } from "./route";
import { HEARTBREAKER_SLUG_REPAIR as repair } from "@/lib/project-slug-aliases";
function request(body: unknown) { return new NextRequest("https://keyatlas.test/api/v1/projects/example", {method:"PATCH",body:JSON.stringify(body)}); }
const invoke = (body: unknown) => PATCH(request(body), {params:Promise.resolve({slug:"example"})});
describe("mobile gallery updates",()=>{
 beforeEach(()=>{ vi.clearAllMocks(); m.api.mockResolvedValue({id:"owner"}); m.findFirst.mockResolvedValue({id:"project",creatorId:"owner"}); m.user.mockResolvedValue({role:"USER"});m.previous.mockResolvedValue({published:false});m.images.mockResolvedValue([]);m.update.mockResolvedValue({id:"project",published:false}); m.transaction.mockImplementation(async(fn)=>fn({project:{update:m.update},projectImage:{findMany:m.images}})); });
 it("preserves existing gallery when images is absent",async()=>{expect((await invoke({title:"Renamed"})).status).toBe(200);expect(m.update.mock.calls[0][0].data).not.toHaveProperty("images");});
 it("clears gallery only for explicit empty images",async()=>{expect((await invoke({images:[]})).status).toBe(200);expect(m.update.mock.calls[0][0].data.images).toEqual({deleteMany:{},create:[]});});
 it("deduplicates gallery URLs and preserves metadata",async()=>{const img={url:"https://example.com/one.png",order:3,alt:"One",linkUrl:"https://example.com/info",openInNewTab:false};expect((await invoke({images:[img,{...img,alt:"Duplicate"}]})).status).toBe(200);expect(m.update.mock.calls[0][0].data.images.create).toEqual([{...img,order:0}]);});
 it.each([null,{},[{}],[{url:123}],[{url:"https://example.com/a",order:"1"}]])("rejects structurally malformed images %#",async(images)=>{expect((await invoke({images})).status).toBe(400);expect(m.transaction).not.toHaveBeenCalled();});
 it.each([{url:""},{url:"not-a-url"},{url:"javascript:alert(1)"},{url:"https://example.com/a",order:1.5},{url:"https://example.com/a",order:-1}])("rejects invalid image fields %#",async(image)=>{expect((await invoke({images:[image]})).status).toBe(400);expect(m.transaction).not.toHaveBeenCalled();});
 it("accepts local storage image filenames",async()=>{expect((await invoke({images:[{url:"/uploads/example.png"}]})).status).toBe(200);});
 it("preserves existing image identity and web link metadata",async()=>{const prior={id:"existing-image",url:"https://example.com/one.png",alt:"Original caption",createdAt:new Date("2026-01-01"),linkUrl:"https://example.com/shop",openInNewTab:false};m.images.mockResolvedValue([prior]);await invoke({images:[{url:prior.url}]});expect(m.update.mock.calls[0][0].data.images.create).toEqual([{...prior,order:0}]);});
 it("rejects missing authentication",async()=>{m.api.mockResolvedValue(null);expect((await invoke({images:[]})).status).toBe(401);expect(m.findFirst).not.toHaveBeenCalled();expect(m.transaction).not.toHaveBeenCalled();});
 it("rejects another user's gallery replacement",async()=>{m.api.mockResolvedValue({id:"stranger"});expect((await invoke({images:[]})).status).toBe(403);expect(m.transaction).not.toHaveBeenCalled();});
 it("allows administrators to replace another user's gallery",async()=>{m.api.mockResolvedValue({id:"admin"});m.user.mockResolvedValue({role:"ADMIN"});expect((await invoke({images:[]})).status).toBe(200);});
 it("does not grant regular owners admin publishing or featuring",async()=>{await invoke({images:[],published:true,featured:true});expect(m.update.mock.calls[0][0].data).not.toHaveProperty("published");expect(m.update.mock.calls[0][0].data).not.toHaveProperty("featured");});
 it.each([repair.oldSlug, repair.newSlug])("looks up retained editor slug %s by immutable ID", async (slug) => {
   m.findFirst.mockResolvedValue({ id: repair.id, creatorId: "owner" });
   expect((await PATCH(request({ title: repair.title }), { params: Promise.resolve({ slug }) })).status).toBe(200);
   expect(m.findFirst).toHaveBeenCalledWith({ where: { id: repair.id }, select: { id: true, creatorId: true } });
   expect(m.update.mock.calls[0][0].where).toEqual({ id: repair.id });
 });
 it("keeps unrelated custom slugs on their existing lookup and does not overwrite slug", async () => {
   await invoke({ title: "Custom title" });
   expect(m.findFirst.mock.calls[0][0].where).toEqual({ slug: { in: ["example"] } });
   expect(m.update.mock.calls[0][0].data).not.toHaveProperty("slug");
 });
 it("does not fall back to an unrelated record when the fixed alias ID is missing", async () => {
   m.findFirst.mockResolvedValue(null);
   expect((await PATCH(request({ title: repair.title }), { params: Promise.resolve({ slug: repair.oldSlug }) })).status).toBe(404);
   expect(m.findFirst).toHaveBeenCalledTimes(1);
   expect(m.transaction).not.toHaveBeenCalled();
 });
});
