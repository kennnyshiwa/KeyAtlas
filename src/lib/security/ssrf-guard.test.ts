import { afterEach, describe, it, expect, vi } from "vitest";
import dns from "dns/promises";
import { assertSafeUrl, isPrivateIP, safeFetch } from "./ssrf-guard";

afterEach(() => {
  vi.restoreAllMocks();
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

  it.each([
    ["CGNAT", "100.64.0.1"],
    ["TEST-NET-1", "192.0.2.1"],
    ["TEST-NET-2", "198.51.100.1"],
    ["TEST-NET-3", "203.0.113.1"],
    ["IPv4 multicast", "224.0.0.1"],
    ["limited broadcast", "255.255.255.255"],
    ["IPv6 link-local outside fe80::/16", "febf::1"],
    ["IPv6 multicast", "ff02::1"],
    ["IPv4-mapped dotted", "::ffff:100.64.0.1"],
    ["IPv4-mapped normalized hex", "::ffff:6440:1"],
  ])("blocks QA probe %s (%s)", (_label, ip) => {
    expect(isPrivateIP(ip)).toBe(true);
  });

  it.each([
    "192.0.0.9",
    "192.31.196.1",
    "192.52.193.1",
    "192.88.99.1",
    "192.175.48.1",
    "198.18.0.1",
    "2001:db8::1",
    "3fff::1",
    "fc00::1",
    "fec0::1",
  ])("blocks additional reserved or special-use address %s", (ip) => {
    expect(isPrivateIP(ip)).toBe(true);
  });

  it("normalizes and rejects bracketed IPv6 URL literals", async () => {
    await expect(assertSafeUrl("https://[::ffff:7f00:1]/image.jpg"))
      .rejects.toThrow("private/internal IP address");
  });

  it("checks every resolved hostname address and fails closed on a special-use result", async () => {
    vi.spyOn(dns, "resolve4").mockResolvedValue(["151.101.1.69", "100.64.0.1"]);
    vi.spyOn(dns, "resolve6").mockResolvedValue([]);

    await expect(assertSafeUrl("https://images.example.test/image.jpg"))
      .rejects.toThrow("private/internal IP address");
  });
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
