import http from "http";
import type { AddressInfo } from "net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Keep the suite hermetic: no live network, database or storage access.
const m = vi.hoisted(() => ({
  safeFetch: vi.fn(),
  upsert: vi.fn(),
  findAsset: vi.fn(),
  createAsset: vi.fn(),
  upload: vi.fn(),
}));
vi.mock("@/lib/security/ssrf-guard", () => ({ safeFetch: m.safeFetch }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    imageMirrorFailure: { upsert: m.upsert },
    imageAsset: { findUnique: m.findAsset, create: m.createAsset },
  },
}));
vi.mock("@/lib/storage", () => ({ getStorageProvider: () => ({ upload: m.upload }) }));

import {
  IMPORT_MIRROR_BUDGET_EXHAUSTED,
  IMPORT_MIRROR_TIME_BUDGET_MS,
  ImageMirrorError,
  MAX_REMOTE_IMAGE_BYTES,
  RETRY_REMOTE_IMAGE_TIMEOUT_MS,
  createImportMirrorBudget,
  REMOTE_IMAGE_TIMEOUT_MS,
  SLOW_HOST_REMOTE_IMAGE_TIMEOUT_MS,
  extractMirrorableImageUrlCandidatesFromHtml,
  isDropImageUrl,
  isGeekhackImageUrl,
  isMirrorableImportImageUrl,
  isPostimgImageUrl,
  mirrorImportImageSrcsInHtml,
  mirrorImportImageUrlOrOriginal,
  mirrorImportImageUrlToLocal,
  mirrorImportMedia,
  mirrorPrefillImages,
  normalizeMirrorableImageUrl,
  readResponseBodyWithLimit,
} from "@/lib/import/imgur-mirror";

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52]);

function chunkedStream(chunks: Uint8Array[], onPull?: () => void): ReadableStream<Uint8Array> {
  let index = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      onPull?.();
      if (index < chunks.length) controller.enqueue(chunks[index++]);
      else controller.close();
    },
  });
}

function imageResponse(body: BodyInit | null, headers: Record<string, string> = {}, status = 200): Response {
  return new Response(body, { status, headers: { "content-type": "image/png", ...headers } });
}

beforeEach(() => {
  vi.clearAllMocks();
  m.safeFetch.mockRejectedValue(new Error("network disabled in tests"));
  m.upsert.mockResolvedValue({ status: "PENDING", resolvedUrl: null });
  m.findAsset.mockResolvedValue(null);
  m.upload.mockResolvedValue("https://images.test/mirrored.png");
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Geekhack/import image mirroring helpers", () => {
  it("detects Geekhack attachment images but not thread links", () => {
    expect(isGeekhackImageUrl("https://geekhack.org/index.php?action=dlattach;topic=126619.0;attach=316873;image")).toBe(true);
    expect(isMirrorableImportImageUrl("https://cdn.geekhack.org/attachments/ocean-spirit-render-jpg.12345/")).toBe(true);
    expect(isMirrorableImportImageUrl("https://geekhack.org/index.php?topic=126619.0")).toBe(false);
  });

  it("reuses one mirrored URL for matching gallery and description sources", async () => {
    const source = "https://i.imgur.com/shared.png";
    const calls: string[] = [];
    const result = await mirrorImportMedia(
      `<p>Before <a href="${source}"><img src="${source}"></a> after</p>`,
      [{ url: source, alt: "Shared" }],
      undefined,
      async (url) => {
        calls.push(url);
        return "https://imagedelivery.net/account/shared/public";
      },
    );

    expect(calls).toEqual([source]);
    expect(result.images[0].url).toBe("https://imagedelivery.net/account/shared/public");
    expect(result.description).toBe(
      '<p>Before <a href="https://imagedelivery.net/account/shared/public"><img src="https://imagedelivery.net/account/shared/public"></a> after</p>',
    );
  });

  it("preserves text/order and mirrors description-only images separately", async () => {
    const gallerySource = "https://i.imgur.com/gallery.png";
    const descriptionOnly = "https://i.imgur.com/detail.png";
    const result = await mirrorImportMedia(
      `<p>First</p><img src="${descriptionOnly}"><p>Last</p><img src="${gallerySource}">`,
      [{ url: gallerySource }],
      undefined,
      async (url) => `https://mirror.test/${new URL(url).pathname.slice(1)}`,
    );

    expect(result.images).toEqual([{ url: "https://mirror.test/gallery.png" }]);
    expect(result.description).toBe(
      '<p>First</p><img src="https://mirror.test/detail.png"><p>Last</p><img src="https://mirror.test/gallery.png">',
    );
  });

  it("ignores decorative Geekhack chrome assets", () => {
    expect(isMirrorableImportImageUrl("https://cdn.geekhack.org/Smileys/default/wink.gif")).toBe(false);
    expect(isMirrorableImportImageUrl("https://cdn.geekhack.org/themes/default/images/logo.png")).toBe(false);
  });

  it("normalizes Geekhack sessionized URLs", () => {
    expect(
      normalizeMirrorableImageUrl(
        "https://geekhack.org/index.php?PHPSESSID=abc123&action=dlattach;topic=126619.0;attach=316873;image",
      ),
    ).toBe("https://geekhack.org/index.php?action=dlattach;topic=126619.0;attach=316873;image");
  });

  it("finds mirrorable HTML image URLs even when encoded as &amp;", () => {
    const html =
      '<p><a href="https://geekhack.org/index.php?PHPSESSID=abc123&amp;action=dlattach;topic=126619.0;attach=316873;image"><img src="https://geekhack.org/index.php?PHPSESSID=abc123&amp;action=dlattach;topic=126619.0;attach=316873;image" /></a></p>';

    expect(Array.from(extractMirrorableImageUrlCandidatesFromHtml(html).entries())).toEqual([
      [
        "https://geekhack.org/index.php?PHPSESSID=abc123&amp;action=dlattach;topic=126619.0;attach=316873;image",
        "https://geekhack.org/index.php?action=dlattach;topic=126619.0;attach=316873;image",
      ],
    ]);
  });

  it("detects Drop-hosted image URLs but not product page links", () => {
    expect(
      isDropImageUrl(
        "https://massdrop-s3.imgix.net/img_thread/1606735031009.071239620843593133481423-melgeekmdaemberkeycapsetdawn65.png?auto=format&fm=jpg&fit=min&w=796&dpr=1&q=70",
      ),
    ).toBe(true);
    expect(
      isDropImageUrl(
        "https://massdrop-s3.imgix.net/product-images/gmk-carbon-custom-keycap-set/FP/thlX0KGvSYSd8bhs9ftQ_community%20(1).jpg",
      ),
    ).toBe(true);
    expect(isMirrorableImportImageUrl("https://drop.com/buy/drop-biip-mt3-extended-custom-keycap-set/")).toBe(false);
  });

  it("detects Postimg-hosted image URLs but not viewer pages", () => {
    expect(isPostimgImageUrl("https://i.postimg.cc/abcd1234/render.png")).toBe(true);
    expect(isMirrorableImportImageUrl("https://postimg.cc/abcd1234")).toBe(false);
    expect(isMirrorableImportImageUrl("https://postimage.cc/abcd1234")).toBe(false);
  });

  it("extracts Postimg image URLs from encoded HTML", () => {
    const html =
      '<p><a href="https://postimg.cc/abcd1234"><img src="https://i.postimg.cc/abcd1234/render.png?foo=1&amp;bar=2" /></a></p>';

    expect(Array.from(extractMirrorableImageUrlCandidatesFromHtml(html).entries())).toEqual([
      [
        "https://i.postimg.cc/abcd1234/render.png?foo=1&amp;bar=2",
        "https://i.postimg.cc/abcd1234/render.png?foo=1&bar=2",
      ],
    ]);
  });

  it("rewrites Postimg viewer anchors to the image URL even when the mirror fails", async () => {
    // Previously this live-fetched i.postimg.cc and was flaky (card 72); the
    // fetch is now mocked to fail so the hotlink fallback path is exercised.
    const html =
      '<p><a href="https://postimg.cc/abcd1234"><img src="https://i.postimg.cc/abcd1234/render.png" /></a></p>';

    const mirrored = await mirrorImportImageSrcsInHtml(html);

    expect(m.safeFetch).toHaveBeenCalledTimes(1);
    expect(mirrored).not.toContain('href="https://postimg.cc/abcd1234"');
    expect(mirrored).toMatch(/href="https:\/\/i\.postimg\.cc\/abcd1234\/render\.png"/);
  });

  it("rewrites Postimg viewer anchors to the mirrored image URL on success", async () => {
    m.safeFetch.mockResolvedValue(imageResponse(PNG_BYTES, { "content-length": String(PNG_BYTES.length) }));
    const html =
      '<p><a href="https://postimg.cc/abcd1234"><img src="https://i.postimg.cc/abcd1234/render.png" /></a></p>';

    const mirrored = await mirrorImportImageSrcsInHtml(html);

    expect(mirrored).toBe(
      '<p><a href="https://images.test/mirrored.png"><img src="https://images.test/mirrored.png" /></a></p>',
    );
    expect(m.upsert).not.toHaveBeenCalled();
  });
  it("extracts Drop imgix image URLs from rich HTML descriptions", () => {
    const html =
      '<p><a href="https://massdrop-s3.imgix.net/img_thread/1606735031009.071239620843593133481423-melgeekmdaemberkeycapsetdawn65.png?auto=format&amp;fm=jpg&amp;fit=min&amp;w=796&amp;dpr=1&amp;q=70"><img src="https://massdrop-s3.imgix.net/img_thread/1606735031009.071239620843593133481423-melgeekmdaemberkeycapsetdawn65.png?auto=format&amp;fm=jpg&amp;fit=min&amp;w=796&amp;dpr=1&amp;q=70" /></a></p>';

    expect(Array.from(extractMirrorableImageUrlCandidatesFromHtml(html).entries())).toEqual([
      [
        "https://massdrop-s3.imgix.net/img_thread/1606735031009.071239620843593133481423-melgeekmdaemberkeycapsetdawn65.png?auto=format&amp;fm=jpg&amp;fit=min&amp;w=796&amp;dpr=1&amp;q=70",
        "https://massdrop-s3.imgix.net/img_thread/1606735031009.071239620843593133481423-melgeekmdaemberkeycapsetdawn65.png?auto=format&fm=jpg&fit=min&w=796&dpr=1&q=70",
      ],
    ]);
  });
});

describe("mirror failure recording", () => {
  it("records a PENDING failure keyed by the normalized URL and returns that same normalized URL", async () => {
    const raw = "https://geekhack.org/index.php?PHPSESSID=abc123&amp;action=dlattach;topic=1.0;attach=2;image";
    const normalized = "https://geekhack.org/index.php?action=dlattach;topic=1.0;attach=2;image";

    // The hotlink fallback must equal the failure row's sourceUrl so the retry
    // job's exact-match rewrite of hero/gallery values finds it.
    await expect(mirrorImportImageUrlOrOriginal(raw, "user-1")).resolves.toBe(normalized);

    expect(m.upsert).toHaveBeenCalledTimes(1);
    const args = m.upsert.mock.calls[0][0];
    expect(args.where).toEqual({ sourceUrl: normalized });
    expect(args.create).toMatchObject({
      sourceUrl: normalized,
      source: "geekhack",
      status: "PENDING",
      attempts: 0,
      lastError: "network disabled in tests",
    });
    expect(args.create.nextAttemptAt).toBeInstanceOf(Date);
    // Existing rows (PENDING / GAVE_UP / RESOLVED) only get their error refreshed.
    expect(Object.keys(args.update).sort()).toEqual(["lastAttemptAt", "lastError"]);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("recorded for retry"));
  });

  it("never throws when recording the failure itself fails", async () => {
    m.upsert.mockRejectedValue(new Error("db down"));
    const url = "https://i.postimg.cc/abcd1234/render.png";

    await expect(mirrorImportImageUrlOrOriginal(url)).resolves.toBe(url);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("could not record for retry: db down"));
  });

  it("uses the mirrored copy when a PENDING row already has a resolvedUrl (rewrite still pending)", async () => {
    m.upsert.mockResolvedValue({ status: "PENDING", resolvedUrl: "https://images.test/resolved.png" });

    await expect(mirrorImportImageUrlOrOriginal("https://i.postimg.cc/abcd1234/render.png")).resolves.toBe(
      "https://images.test/resolved.png",
    );
  });

  it("uses the resolved mirror when the retry job already resolved this URL", async () => {
    m.upsert.mockResolvedValue({ status: "RESOLVED", resolvedUrl: "https://images.test/resolved.png" });

    await expect(mirrorImportImageUrlOrOriginal("https://i.postimg.cc/abcd1234/render.png")).resolves.toBe(
      "https://images.test/resolved.png",
    );
  });

  it("records failures from prefill and media helpers without throwing", async () => {
    const images = await mirrorPrefillImages([{ url: "https://i.imgur.com/a.png" }, { url: "https://example.com/x.png" }]);
    expect(images).toEqual([{ url: "https://i.imgur.com/a.png" }, { url: "https://example.com/x.png" }]);

    const media = await mirrorImportMedia('<img src="https://i.postimg.cc/b/c.png">', [{ url: "https://i.imgur.com/a.png" }]);
    expect(media.description).toBe('<img src="https://i.postimg.cc/b/c.png">');
    expect(m.upsert.mock.calls.map((call) => call[0].where.sourceUrl)).toEqual([
      "https://i.imgur.com/a.png",
      "https://i.imgur.com/a.png",
      "https://i.postimg.cc/b/c.png",
    ]);
  });

  it("does not record anything for non-mirrorable URLs", async () => {
    await expect(mirrorImportImageUrlOrOriginal("https://example.com/x.png")).resolves.toBe("https://example.com/x.png");
    expect(m.safeFetch).not.toHaveBeenCalled();
    expect(m.upsert).not.toHaveBeenCalled();
  });
});

describe("mirror download", () => {
  it("uses a longer import timeout for Postimg and the short default for fast hosts", async () => {
    m.safeFetch.mockImplementation(async () => imageResponse(PNG_BYTES));

    await mirrorImportImageUrlToLocal("https://i.postimg.cc/abcd1234/render.png");
    await mirrorImportImageUrlToLocal("https://i.imgur.com/abc.png");
    await mirrorImportImageUrlToLocal("https://i.imgur.com/abc.png", undefined, { timeoutMs: 99_000 });

    expect(m.safeFetch.mock.calls.map((call) => call[1].timeoutMs)).toEqual([
      SLOW_HOST_REMOTE_IMAGE_TIMEOUT_MS,
      REMOTE_IMAGE_TIMEOUT_MS,
      99_000,
    ]);
    expect(SLOW_HOST_REMOTE_IMAGE_TIMEOUT_MS).toBe(30_000);
    expect(RETRY_REMOTE_IMAGE_TIMEOUT_MS).toBe(120_000);
  });

  it("marks a 200 that is not a valid image as permanent", async () => {
    m.safeFetch.mockResolvedValueOnce(new Response("<html>", { status: 200, headers: { "content-type": "text/html" } }));
    await expect(mirrorImportImageUrlToLocal("https://i.imgur.com/abc.png")).rejects.toMatchObject({
      message: "Unexpected content type: text/html",
      permanent: true,
    });

    m.safeFetch.mockResolvedValueOnce(imageResponse(new Uint8Array([1, 2, 3, 4])));
    await expect(mirrorImportImageUrlToLocal("https://i.imgur.com/abc.png")).rejects.toMatchObject({ permanent: true });
  });

  it("marks 404/410 as permanent and other HTTP errors as transient", async () => {
    m.safeFetch.mockResolvedValueOnce(new Response("gone", { status: 404 }));
    const notFound = await mirrorImportImageUrlToLocal("https://i.imgur.com/abc.png").catch((err) => err);
    expect(notFound).toBeInstanceOf(ImageMirrorError);
    expect(notFound).toMatchObject({ status: 404, permanent: true });

    m.safeFetch.mockResolvedValueOnce(new Response("busy", { status: 503 }));
    const busy = await mirrorImportImageUrlToLocal("https://i.imgur.com/abc.png").catch((err) => err);
    expect(busy).toMatchObject({ status: 503, permanent: false });
  });

  it("reports a timeout during the body read as a mirror timeout", async () => {
    const timeout = new DOMException("The operation was aborted due to timeout", "TimeoutError");
    m.safeFetch.mockResolvedValue(
      imageResponse(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(PNG_BYTES);
            controller.error(timeout);
          },
        }),
      ),
    );

    const error = await mirrorImportImageUrlToLocal("https://i.postimg.cc/a/b.png").catch((err) => err);
    expect(error.message).toBe(`Mirror fetch timed out after ${SLOW_HOST_REMOTE_IMAGE_TIMEOUT_MS}ms`);
    expect(error.permanent).toBe(false);
    expect(error.cause).toBe(timeout);
  });

  it("rejects a short read against Content-Length instead of storing a truncated image", async () => {
    m.safeFetch.mockResolvedValue(imageResponse(chunkedStream([PNG_BYTES]), { "content-length": "1000" }));

    await expect(mirrorImportImageUrlToLocal("https://i.imgur.com/abc.png")).rejects.toThrow(
      `Short read: received ${PNG_BYTES.length} of 1000 bytes`,
    );
    expect(m.upload).not.toHaveBeenCalled();
  });
});

describe("readResponseBodyWithLimit", () => {
  it("reads a complete body matching Content-Length", async () => {
    const body = await readResponseBodyWithLimit(
      imageResponse(chunkedStream([PNG_BYTES.slice(0, 4), PNG_BYTES.slice(4)]), {
        "content-length": String(PNG_BYTES.length),
      }),
      1024,
    );
    expect(Array.from(body)).toEqual(Array.from(PNG_BYTES));
  });

  it("aborts as soon as the streamed body exceeds the cap, without reading the rest", async () => {
    let pulls = 0;
    const chunk = new Uint8Array(400);
    const response = imageResponse(chunkedStream(Array.from({ length: 50 }, () => chunk), () => pulls++));

    const error = await readResponseBodyWithLimit(response, 1000).catch((err) => err);

    expect(error).toBeInstanceOf(ImageMirrorError);
    expect(error.message).toContain("exceeds max size");
    expect(error.permanent).toBe(true);
    expect(pulls).toBeLessThan(10);
  });

  it("rejects an oversized declared Content-Length before reading", async () => {
    let pulls = 0;
    const response = imageResponse(chunkedStream([PNG_BYTES], () => pulls++), {
      "content-length": String(MAX_REMOTE_IMAGE_BYTES + 1),
    });

    await expect(readResponseBodyWithLimit(response, MAX_REMOTE_IMAGE_BYTES)).rejects.toThrow("Image too large");
    expect(pulls).toBeLessThanOrEqual(1);
  });

  it("detects a short read", async () => {
    await expect(
      readResponseBodyWithLimit(imageResponse(chunkedStream([PNG_BYTES]), { "content-length": "17" }), 1024),
    ).rejects.toThrow("Short read: received 16 of 17 bytes");
  });

  it("skips the length check for content-encoded bodies", async () => {
    const body = await readResponseBodyWithLimit(
      imageResponse(chunkedStream([PNG_BYTES]), { "content-length": "3", "content-encoding": "gzip" }),
      1024,
    );
    expect(body.length).toBe(PNG_BYTES.length);
  });

  it("is covered by the fetch AbortSignal timeout while streaming the body (local server)", async () => {
    // safeFetch passes AbortSignal.timeout() to fetch; verify Node's fetch keeps
    // that deadline active during the body read (not just until headers).
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "content-type": "image/png", "content-length": "1000" });
      res.write(Buffer.alloc(10));
      // never finishes the body
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const { port } = server.address() as AddressInfo;
      const response = await fetch(`http://127.0.0.1:${port}/slow.png`, { signal: AbortSignal.timeout(300) });
      expect(response.ok).toBe(true);
      const error = await readResponseBodyWithLimit(response, 1024).catch((err) => err);
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe("TimeoutError");
    } finally {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

describe("import mirror time budget", () => {
  const urls = ["https://i.postimg.cc/a/1.png", "https://i.postimg.cc/b/2.png", "https://i.postimg.cc/c/3.png"];

  it("defaults to 90 s", () => {
    expect(IMPORT_MIRROR_TIME_BUDGET_MS).toBe(90_000);
    let now = 1_000;
    const budget = createImportMirrorBudget(undefined, () => now);
    expect(budget.remainingMs()).toBe(90_000);
    now += 100_000;
    expect(budget.remainingMs()).toBe(0);
  });

  it("mirrorImportMedia stops fetching once the budget is spent and records the rest as PENDING", async () => {
    let now = 0;
    const calls: { url: string; timeoutMs?: number }[] = [];
    const mirrorUrl = vi.fn(async (url: string, _userId?: string, options?: { timeoutMs?: number }) => {
      calls.push({ url, timeoutMs: options?.timeoutMs });
      now += 30_000; // each slow image burns its full 30 s timeout
      return url; // hotlink fallback, as mirrorImportImageUrlOrOriginal would
    });

    const result = await mirrorImportMedia(
      `<img src="${urls[2]}">`,
      [{ url: urls[0] }, { url: urls[1] }],
      "user-1",
      mirrorUrl,
      // Sequential so the per-fetch timeout capping is deterministic.
      { budgetMs: 50_000, clock: () => now, concurrency: 1 },
    );

    // 1st fetch: full 30 s timeout; 2nd: capped at the 20 s left; 3rd: skipped.
    expect(calls).toEqual([
      { url: urls[0], timeoutMs: 30_000 },
      { url: urls[1], timeoutMs: 20_000 },
    ]);
    expect(result.images.map((image) => image.url)).toEqual([urls[0], urls[1]]);
    expect(result.description).toBe(`<img src="${urls[2]}">`);
    expect(m.upsert).toHaveBeenCalledTimes(1);
    expect(m.upsert.mock.calls[0][0]).toMatchObject({
      where: { sourceUrl: urls[2] },
      create: { status: "PENDING", source: "postimg", lastError: IMPORT_MIRROR_BUDGET_EXHAUSTED },
    });
    // Budget exhaustion is not a real attempt: an existing row's lastError is kept.
    expect(m.upsert.mock.calls[0][0].update).toEqual({});
  });

  it("uses a previously resolved mirror for URLs skipped by the budget", async () => {
    m.upsert.mockResolvedValue({ status: "RESOLVED", resolvedUrl: "https://images.test/resolved.png" });
    const mirrorUrl = vi.fn(async (url: string) => url);

    const result = await mirrorImportMedia("", [{ url: urls[0] }], undefined, mirrorUrl, { budgetMs: 0 });

    expect(mirrorUrl).not.toHaveBeenCalled();
    expect(result.images).toEqual([{ url: "https://images.test/resolved.png" }]);
  });

  it("does not spend budget on or record non-mirrorable URLs", async () => {
    const mirrorUrl = vi.fn(async (url: string) => url);

    const result = await mirrorImportMedia("", [{ url: "https://example.com/x.png" }], undefined, mirrorUrl, {
      budgetMs: 0,
    });

    expect(result.images).toEqual([{ url: "https://example.com/x.png" }]);
    expect(m.upsert).not.toHaveBeenCalled();
  });

  it("mirrorImportImageSrcsInHtml caps fetch timeouts and skips URLs after the budget", async () => {
    let now = 0;
    m.safeFetch.mockImplementation(async () => {
      now += 60_000;
      throw new Error("Mirror fetch timed out");
    });
    const html = urls.map((url) => `<img src="${url}">`).join("");

    const result = await mirrorImportImageSrcsInHtml(html, undefined, { budgetMs: 90_000, clock: () => now });

    expect(result).toBe(html);
    expect(m.safeFetch.mock.calls.map((call) => call[1].timeoutMs)).toEqual([30_000, 30_000]);
    expect(m.upsert.mock.calls.map((call) => [call[0].where.sourceUrl, call[0].create.lastError])).toEqual([
      [urls[0], "Mirror fetch timed out"],
      [urls[1], "Mirror fetch timed out"],
      [urls[2], IMPORT_MIRROR_BUDGET_EXHAUSTED],
    ]);
  });

  it("mirrorPrefillImages honours a shared budget", async () => {
    let now = 0;
    const budget = createImportMirrorBudget(10_000, () => now);
    m.safeFetch.mockImplementation(async () => imageResponse(PNG_BYTES));

    now = 5_000;
    const first = await mirrorPrefillImages([{ url: urls[0] }], undefined, { budget });
    expect(first).toEqual([{ url: "https://images.test/mirrored.png" }]);
    expect(m.safeFetch.mock.calls[0][1].timeoutMs).toBe(5_000);

    now = 10_000;
    const second = await mirrorPrefillImages([{ url: urls[1] }, { url: urls[2] }], undefined, { budget });
    expect(second).toEqual([{ url: urls[1] }, { url: urls[2] }]);
    expect(m.safeFetch).toHaveBeenCalledTimes(1);
    expect(m.upsert.mock.calls.map((call) => call[0].create.lastError)).toEqual([
      IMPORT_MIRROR_BUDGET_EXHAUSTED,
      IMPORT_MIRROR_BUDGET_EXHAUSTED,
    ]);
  });
});

describe("mirrorImportMedia gallery concurrency", () => {
  it("runs at most 4 gallery fetches at once, fetches shared URLs once, keeps order, then does the description", async () => {
    const gallery = Array.from({ length: 10 }, (_, i) => `https://i.imgur.com/g${i}.png`);
    gallery[6] = gallery[1]; // duplicate inside the gallery
    const descriptionOnly = "https://i.postimg.cc/d/only.png";
    const description = `<img src="${gallery[1]}"><img src="${descriptionOnly}"><img src="${gallery[9]}">`;

    let active = 0;
    let maxActive = 0;
    const events: string[] = [];
    const mirrorUrl = vi.fn(async (url: string) => {
      active++;
      maxActive = Math.max(maxActive, active);
      events.push(`start ${url}`);
      // Uneven delays so completions interleave out of order.
      await new Promise((resolve) => setTimeout(resolve, 5 + ((url.length * 7) % 11)));
      active--;
      events.push(`end ${url}`);
      return url.replace(/^https:\/\/[^/]+\//, "https://mirror.test/");
    });

    const result = await mirrorImportMedia(
      description,
      gallery.map((url, i) => ({ url, alt: `#${i}` })),
      undefined,
      mirrorUrl,
    );

    expect(maxActive).toBe(4);
    const fetched = mirrorUrl.mock.calls.map((call) => call[0]);
    expect(new Set(fetched).size).toBe(fetched.length); // never the same URL twice
    expect(fetched.filter((url) => url === gallery[1])).toHaveLength(1);
    expect(fetched).toHaveLength(10); // 9 unique gallery URLs + 1 description-only

    // Output order (and extra fields) preserved, duplicate resolved identically.
    expect(result.images).toEqual(
      gallery.map((url, i) => ({ url: url.replace("https://i.imgur.com/", "https://mirror.test/"), alt: `#${i}` })),
    );
    // Description fetch only starts after every gallery fetch has finished.
    const descriptionStart = events.indexOf(`start ${descriptionOnly}`);
    const lastGalleryEnd = Math.max(...gallery.map((url) => events.lastIndexOf(`end ${url}`)));
    expect(descriptionStart).toBeGreaterThan(lastGalleryEnd);
    expect(result.description).toBe(
      '<img src="https://mirror.test/g1.png"><img src="https://mirror.test/d/only.png"><img src="https://mirror.test/g9.png">',
    );
  });

  it("shares one in-flight fetch for concurrent duplicates", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const mirrorUrl = vi.fn(async (url: string) => {
      await gate;
      return `${url}#mirrored`;
    });
    const url = "https://i.imgur.com/same.png";

    const pending = mirrorImportMedia("", [{ url }, { url }, { url }, { url }], undefined, mirrorUrl);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mirrorUrl).toHaveBeenCalledTimes(1);
    release();

    expect((await pending).images).toEqual(Array.from({ length: 4 }, () => ({ url: `${url}#mirrored` })));
  });

  it("records URLs skipped by the budget as PENDING with concurrent workers", async () => {
    const mirrorUrl = vi.fn(async (url: string) => url);
    const result = await mirrorImportMedia("", urls4(), undefined, mirrorUrl, { budgetMs: 0 });

    expect(mirrorUrl).not.toHaveBeenCalled();
    expect(result.images.map((image) => image.url)).toEqual(urls4().map((image) => image.url));
    expect(m.upsert.mock.calls.map((call) => [call[0].create.status, call[0].create.lastError])).toEqual(
      Array.from({ length: 4 }, () => ["PENDING", "import mirror budget exhausted"]),
    );
  });
});

function urls4() {
  return [1, 2, 3, 4].map((i) => ({ url: `https://i.postimg.cc/x${i}/img.png` }));
}
