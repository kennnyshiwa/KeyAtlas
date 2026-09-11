import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const m = vi.hoisted(()=>({auth:vi.fn(),api:vi.fn(),find:vi.fn(),create:vi.fn(),upload:vi.fn(),validate:vi.fn()}));
vi.mock("@/lib/auth",()=>({auth:m.auth}));
vi.mock("@/lib/api-auth",()=>({authenticateApiKey:m.api}));
vi.mock("@/lib/prisma",()=>({prisma:{imageAsset:{findUnique:m.find,create:m.create}}}));
vi.mock("@/lib/storage",()=>({getStorageProvider:()=>({upload:m.upload})}));
vi.mock("@/lib/security/upload-validation",()=>({validateImageBuffer:m.validate}));
import {POST} from "./route";
function request(type="image/png") { const body=new FormData();body.set("file",new File([new Uint8Array([1,2,3])],"test.png",{type}));return new NextRequest("https://keyatlas.test/api/upload",{method:"POST",body}); }
describe("mobile and browser uploads",()=>{
 beforeEach(()=>{vi.clearAllMocks();m.api.mockResolvedValue(null);m.auth.mockResolvedValue(null);m.find.mockResolvedValue(null);m.validate.mockReturnValue({valid:true});m.upload.mockResolvedValue("https://example.com/upload.png");});
 it("uploads with mobile identity and records uploader",async()=>{m.api.mockResolvedValue({id:"mobile"});expect((await POST(request())).status).toBe(200);expect(m.auth).not.toHaveBeenCalled();expect(m.upload.mock.calls[0][3].userId).toBe("mobile");expect(m.create.mock.calls[0][0].data.uploaderId).toBe("mobile");});
 it("preserves browser session authentication",async()=>{m.auth.mockResolvedValue({user:{id:"web"}});expect((await POST(request())).status).toBe(200);expect(m.create.mock.calls[0][0].data.uploaderId).toBe("web");});
 it("rejects unauthenticated upload",async()=>{expect((await POST(request())).status).toBe(401);expect(m.upload).not.toHaveBeenCalled();});
 it("retains file type checks for bearer users",async()=>{m.api.mockResolvedValue({id:"mobile"});expect((await POST(request("text/html"))).status).toBe(400);expect(m.upload).not.toHaveBeenCalled();});
 it("retains magic-byte checks for bearer users",async()=>{m.api.mockResolvedValue({id:"mobile"});m.validate.mockReturnValue({valid:false,error:"Bad image"});expect((await POST(request())).status).toBe(400);expect(m.upload).not.toHaveBeenCalled();});
});
