import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Prefill call sites (URL prefill + Geekhack import route) must mirror the
// gallery first, then description-only images, under one budget, and fetch a
// URL shared by gallery and description only once. Real imgur-mirror code runs
// against mocked fetch/storage/prisma.
const GALLERY_SHARED = "https://i.postimg.cc/shared/hero.png";
const GALLERY_ONLY = "https://i.imgur.com/gallery.png";
const DESCRIPTION_ONLY = "https://i.postimg.cc/desc/detail.png";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52]);

const m = vi.hoisted(() => ({ safeFetch: vi.fn(), upload: vi.fn(), auth: vi.fn() }));
vi.mock("@/lib/security/ssrf-guard", () => ({ safeFetch: m.safeFetch }));
vi.mock("@/lib/storage", () => ({ getStorageProvider: () => ({ upload: m.upload }) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    imageAsset: { findUnique: async () => null, create: async () => ({}) },
    imageMirrorFailure: { upsert: async () => ({ status: "PENDING", resolvedUrl: null }) },
  },
}));
vi.mock("@/lib/auth", () => ({ auth: m.auth }));
vi.mock("@/lib/import/geekhack", () => ({
  validateGeekhackTopicUrl: (url: string) =>
    url.includes("geekhack.org") ? { normalizedUrl: "https://geekhack.org/index.php?topic=1.0" } : null,
  fetchGeekhackThread: async () => ({ title: "GMK Test", canonicalUrl: "https://geekhack.org/index.php?topic=1.0" }),
  buildGeekhackPrefillPayload: () => ({
    title: "GMK Test",
    // Description lists its own image first; the gallery must still go first.
    description: `<p>x</p><img src="${DESCRIPTION_ONLY}"><img src="${GALLERY_SHARED}">`,
    images: [{ url: GALLERY_SHARED }, { url: GALLERY_ONLY }],
    links: [],
  }),
}));

import { importUrlPrefill } from "@/lib/import/url-prefill";
import { POST } from "@/app/api/import/geekhack/route";

const events: string[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  events.length = 0;
  m.safeFetch.mockImplementation(async (url: string) => {
    events.push(`fetch ${url}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
    return new Response(PNG, { headers: { "content-type": "image/png" } });
  });
  m.upload.mockImplementation(async (_bytes: Buffer, filename: string) => {
    events.push(`upload ${filename}`);
    return `https://images.test/${filename}`;
  });
  m.auth.mockResolvedValue({ user: { id: "user-1" } });
});

function expectGalleryFirstAndSharedOnce(result: { description: string; images?: { url: string }[] }) {
  // Gallery images (fetched concurrently, so in either order) come first; the
  // shared URL is fetched once; the description-only image is fetched last and
  // only after both gallery images have been fully mirrored (uploaded).
  const fetched = m.safeFetch.mock.calls.map((call) => call[0]);
  expect(fetched.slice(0, 2).sort()).toEqual([GALLERY_ONLY, GALLERY_SHARED].sort());
  expect(fetched).toHaveLength(3);
  expect(fetched[2]).toBe(DESCRIPTION_ONLY);
  const descriptionFetch = events.indexOf(`fetch ${DESCRIPTION_ONLY}`);
  const galleryUploads = events.flatMap((event, index) =>
    /^upload .*(hero|gallery)\.png$/.test(event) ? [index] : [],
  );
  expect(galleryUploads).toHaveLength(2);
  expect(descriptionFetch).toBeGreaterThan(Math.max(...galleryUploads));
  const [shared, galleryOnly] = (result.images ?? []).map((image) => image.url);
  expect(shared).toMatch(/^https:\/\/images\.test\/.*hero\.png$/);
  expect(galleryOnly).toMatch(/^https:\/\/images\.test\/.*gallery\.png$/);
  // The description reuses the gallery's mirrored URL for the shared image.
  expect(result.description).toContain(`<img src="${shared}">`);
  expect(result.description).toMatch(/<img src="https:\/\/images\.test\/[^"]*detail\.png">/);
}

describe("prefill mirroring order", () => {
  it("URL prefill (Geekhack branch) mirrors gallery first and shared URLs once", async () => {
    expectGalleryFirstAndSharedOnce(await importUrlPrefill("https://geekhack.org/index.php?topic=1.0"));
  });

  it("Geekhack import route mirrors gallery first and shared URLs once", async () => {
    const response = await POST(
      new NextRequest("https://keyatlas.test/api/import/geekhack", {
        method: "POST",
        body: JSON.stringify({ url: "https://geekhack.org/index.php?topic=1.0" }),
      }),
    );
    expect(response.status).toBe(200);
    expectGalleryFirstAndSharedOnce((await response.json()).prefill);
    expect(m.upload.mock.calls[0][3]).toMatchObject({ userId: "user-1" });
  });
});
