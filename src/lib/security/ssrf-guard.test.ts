import { afterEach, describe, it, expect, vi } from "vitest";
import { isPrivateIP, safeFetch } from "./ssrf-guard";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isPrivateIP", () => {
  it("blocks 127.0.0.1", () => expect(isPrivateIP("127.0.0.1")).toBe(true));
  it("blocks 10.x", () => expect(isPrivateIP("10.0.0.1")).toBe(true));
  it("blocks 172.16.x", () => expect(isPrivateIP("172.16.0.1")).toBe(true));
  it("blocks 192.168.x", () => expect(isPrivateIP("192.168.1.1")).toBe(true));
  it("blocks 169.254.x (link-local)", () => expect(isPrivateIP("169.254.1.1")).toBe(true));
  it("blocks 0.0.0.0", () => expect(isPrivateIP("0.0.0.0")).toBe(true));
  it("allows public IP", () => expect(isPrivateIP("8.8.8.8")).toBe(false));
  it("allows public IP 2", () => expect(isPrivateIP("151.101.1.69")).toBe(false));
  it("blocks ::1", () => expect(isPrivateIP("::1")).toBe(true));
  it("blocks ::", () => expect(isPrivateIP("::")).toBe(true));
  it("blocks fe80:: link-local", () => expect(isPrivateIP("fe80::1")).toBe(true));
  it("blocks fd00:: ULA", () => expect(isPrivateIP("fd00::1")).toBe(true));
  it("blocks ::ffff:127.0.0.1", () => expect(isPrivateIP("::ffff:127.0.0.1")).toBe(true));
  it("allows public IPv6", () => expect(isPrivateIP("2607:f8b0:4004:800::200e")).toBe(false));
});

describe("safeFetch redirects", () => {
  it("rejects a redirect to a private IP before requesting the target", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, { status: 302, headers: { location: "http://127.0.0.1/private.jpg" } })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(safeFetch("https://8.8.8.8/image.jpg", {
      allowedProtocols: ["https:"],
    })).rejects.toThrow("private/internal IP address");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a redirect that downgrades an HTTPS-only request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, { status: 302, headers: { location: "http://8.8.4.4/image.jpg" } })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(safeFetch("https://8.8.8.8/image.jpg", {
      allowedProtocols: ["https:"],
    })).rejects.toThrow("disallowed protocol");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
