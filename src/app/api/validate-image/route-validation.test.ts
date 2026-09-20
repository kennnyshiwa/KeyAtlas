import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  safeFetch: vi.fn(),
  auth: vi.fn(async () => ({ user: { id: "test-user" } })),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/security/ssrf-guard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/security/ssrf-guard")>();
  return { ...actual, safeFetch: mocks.safeFetch };
});

import { NextRequest } from "next/server";
import { validateRemoteImage } from "@/lib/security/remote-image-validation";
import { POST } from "./route";
import { UrlSafetyError } from "@/lib/security/ssrf-guard";

const postimgUrl = "https://i.postimg.cc/tp3GgzDB/01-base-2026-09-07-19-00-28-Greenshot.jpg";
const cloudflareUrl = "https://imagedelivery.net/m0p8rUUdkqTB71WSkwM2sg/6d53d0af-76a3-4e7d-92f1-0113f55d3b00/public";

function response(status = 200, headers: Record<string, string> = {}) {
  return new Response(null, { status, headers });
}

function request(url: string) {
  return new NextRequest("https://keyatlas.test/api/validate-image", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url }),
  });
}

describe("remote image validation", () => {
  beforeEach(() => {
    mocks.safeFetch.mockReset();
    mocks.auth.mockClear();
  });

  it("accepts the owner's prior upload through the real remote validator", async () => {
    mocks.safeFetch.mockResolvedValueOnce(response(200, {
      "content-type": "image/jpeg", "content-length": "309431",
    }));
    const result = await POST(request(cloudflareUrl));
    expect(result.status).toBe(200);
    await expect(result.json()).resolves.toEqual({ valid: true, url: cloudflareUrl });
    expect(mocks.safeFetch).toHaveBeenCalledWith(cloudflareUrl, expect.objectContaining({
      method: "HEAD", allowedProtocols: ["https:"], timeoutMs: 5000,
    }));
  });

  it.each<Record<string, string>>([
    { "content-type": "text/html", "content-length": "500" },
    { "content-type": "image/jpeg", "content-length": String(20 * 1024 * 1024 + 1) },
    { "content-type": "image/jpeg" },
  ])("does not trust a delivery hostname instead of content/size checks: %j", async (headers) => {
    mocks.safeFetch.mockResolvedValueOnce(response(200, headers));
    expect((await POST(request(cloudflareUrl))).status).toBe(400);
    expect(mocks.safeFetch).toHaveBeenCalledTimes(1);
  });

  it("preserves a redirect/private-network rejection without a fallback fetch", async () => {
    mocks.safeFetch.mockRejectedValueOnce(new UrlSafetyError("Private target"));
    const result = await POST(request(cloudflareUrl));
    expect(result.status).toBe(400);
    await expect(result.json()).resolves.toEqual({ error: "Image URL is not allowed" });
    expect(mocks.safeFetch).toHaveBeenCalledTimes(1);
  });

  it("accepts the reported Postimg JPEG after a flaky HEAD timeout via bounded Range GET", async () => {
    const timeout = new Error("timed out");
    timeout.name = "TimeoutError";
    mocks.safeFetch
      .mockRejectedValueOnce(timeout)
      .mockResolvedValueOnce(response(206, {
        "content-type": "image/jpeg",
        "content-range": "bytes 0-0/123456",
      }));

    const result = await POST(request(postimgUrl));

    expect(result.status).toBe(200);
    await expect(result.json()).resolves.toEqual({ valid: true, url: postimgUrl });
    expect(mocks.safeFetch).toHaveBeenCalledTimes(2);
    expect(mocks.safeFetch).toHaveBeenNthCalledWith(1, postimgUrl, expect.objectContaining({
      method: "HEAD",
      timeoutMs: 5000,
      allowedProtocols: ["https:"],
    }));
    expect(mocks.safeFetch).toHaveBeenNthCalledWith(2, postimgUrl, expect.objectContaining({
      method: "GET",
      timeoutMs: 5000,
      allowedProtocols: ["https:"],
      headers: { Range: "bytes=0-0", Accept: "image/*" },
    }));
  });

  it("accepts a valid direct JPEG with HEAD only", async () => {
    mocks.safeFetch.mockResolvedValueOnce(response(200, {
      "content-type": "image/jpeg; charset=binary",
      "content-length": "2048",
    }));

    await expect(validateRemoteImage(postimgUrl)).resolves.toBeUndefined();
    expect(mocks.safeFetch).toHaveBeenCalledTimes(1);
  });

  it("uses Range GET when a host does not support HEAD", async () => {
    mocks.safeFetch
      .mockResolvedValueOnce(response(405))
      .mockResolvedValueOnce(response(206, {
        "content-type": "image/png",
        "content-range": "bytes 0-0/4096",
      }));

    await expect(validateRemoteImage("https://other-host.test/image.png")).resolves.toBeUndefined();
    expect(mocks.safeFetch).toHaveBeenCalledTimes(2);
  });

  it("uses Range GET when HEAD returns 501 Not Implemented", async () => {
    mocks.safeFetch
      .mockResolvedValueOnce(response(501))
      .mockResolvedValueOnce(response(206, {
        "content-type": "image/webp",
        "content-range": "bytes 0-0/8192",
      }));

    await expect(validateRemoteImage("https://other-host.test/image.webp")).resolves.toBeUndefined();
    expect(mocks.safeFetch).toHaveBeenCalledTimes(2);
  });

  it("rejects invalid content types without retrying", async () => {
    mocks.safeFetch.mockResolvedValueOnce(response(200, {
      "content-type": "text/html",
      "content-length": "500",
    }));

    await expect(validateRemoteImage(postimgUrl)).rejects.toThrow("does not point to a valid image");
    expect(mocks.safeFetch).toHaveBeenCalledTimes(1);
  });

  it("rejects oversized HEAD and ranged responses", async () => {
    mocks.safeFetch.mockResolvedValueOnce(response(200, {
      "content-type": "image/jpeg",
      "content-length": String(20 * 1024 * 1024 + 1),
    }));
    await expect(validateRemoteImage(postimgUrl)).rejects.toThrow("too large");

    const timeout = new Error("timed out");
    timeout.name = "TimeoutError";
    mocks.safeFetch
      .mockRejectedValueOnce(timeout)
      .mockResolvedValueOnce(response(206, {
        "content-type": "image/jpeg",
        "content-range": `bytes 0-0/${20 * 1024 * 1024 + 1}`,
      }));
    await expect(validateRemoteImage(postimgUrl)).rejects.toThrow("too large");
  });

  it("rejects image responses whose total size cannot be proven", async () => {
    mocks.safeFetch.mockResolvedValueOnce(response(200, {
      "content-type": "image/jpeg",
    }));
    await expect(validateRemoteImage(postimgUrl)).rejects.toThrow("determine image size");

    const timeout = new Error("timed out");
    timeout.name = "TimeoutError";
    mocks.safeFetch
      .mockRejectedValueOnce(timeout)
      .mockResolvedValueOnce(response(206, {
        "content-type": "image/jpeg",
        "content-length": "1",
      }));
    await expect(validateRemoteImage(postimgUrl)).rejects.toThrow("determine image size");
  });

  it("preserves a meaningful timeout category after the fallback also times out", async () => {
    const timeout = new Error("timed out");
    timeout.name = "TimeoutError";
    mocks.safeFetch.mockRejectedValue(timeout);

    const result = await POST(request(postimgUrl));

    expect(result.status).toBe(400);
    await expect(result.json()).resolves.toEqual({ error: "Image URL verification timed out" });
    expect(mocks.safeFetch).toHaveBeenCalledTimes(2);
  });

  it("continues to reject non-HTTPS image URLs before fetching", async () => {
    const result = await POST(request("http://i.postimg.cc/image.jpg"));

    expect(result.status).toBe(400);
    await expect(result.json()).resolves.toEqual({ error: "Only HTTPS URLs are allowed" });
    expect(mocks.safeFetch).not.toHaveBeenCalled();
  });
});
