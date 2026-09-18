import { describe, it, expect } from "vitest";
import { parseGeekhackTimestamp, enrichProject, buildVendorLookups } from "./geekhack-enrich";
import type { ExtractedThread } from "./geekhack";

describe("parseGeekhackTimestamp", () => {
  it("parses the live Geekhack OP format with entities", () => {
    const d = parseGeekhackTimestamp("Wed, 16 September 2026, 03:14:10 &#187;");
    expect(d?.toISOString()).toBe("2026-09-16T00:00:00.000Z");
  });

  it("parses the format without a weekday prefix", () => {
    const d = parseGeekhackTimestamp("16 September 2026, 03:14:10");
    expect(d?.toISOString()).toBe("2026-09-16T00:00:00.000Z");
  });

  it("parses the month-first variant", () => {
    const d = parseGeekhackTimestamp("September 16, 2026, 03:14:10 PM");
    expect(d?.toISOString()).toBe("2026-09-16T00:00:00.000Z");
  });

  it("returns null for null, empty or unparseable input", () => {
    expect(parseGeekhackTimestamp(null)).toBeNull();
    expect(parseGeekhackTimestamp("")).toBeNull();
    expect(parseGeekhackTimestamp("Today at 04:01:22")).toBeNull();
  });
});

const vendorLookups = buildVendorLookups([]);

function makeProject(overrides: Record<string, unknown> = {}) {
  return {
    id: "p1",
    title: "Totally Real Keycaps",
    slug: "totally-real-keycaps",
    status: "INTEREST_CHECK",
    description: "A normal description.",
    designer: null,
    vendorId: null,
    priceMin: null,
    priceMax: null,
    currency: null,
    icDate: null,
    gbStartDate: null,
    gbEndDate: null,
    tags: ["geekhack", "auto-imported"],
    createdAt: new Date("2026-09-16T12:00:00Z"),
    links: [],
    projectVendors: [],
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function makeThread(contentText: string, timestamp: string | null): ExtractedThread {
  return {
    sourceUrl: "https://geekhack.org/index.php?topic=127113.0",
    fetchedAt: new Date().toISOString(),
    topicId: "127113",
    title: "[IC] Totally Real Keycaps",
    canonicalUrl: "https://geekhack.org/index.php?topic=127113.0",
    op: {
      messageId: "3219661",
      postNumber: 1,
      author: "tester",
      timestamp,
      contentHtml: `<p>${contentText}</p>`,
      contentText,
      links: [],
      imageUrls: [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    posts: [],
    metadata: { postCount: 1, uniqueAuthors: 1, allLinks: [], allImageUrls: [] },
  };
}

describe("enrichProject icDate fallback", () => {
  it("uses the OP post date when the body never states an IC date", () => {
    const result = enrichProject(
      makeProject(),
      makeThread("Hello everyone, here are some renders.", "Wed, 16 September 2026, 03:14:10 &#187;"),
      vendorLookups
    );
    expect(result.projectUpdate.icDate).toEqual(new Date("2026-09-16T00:00:00.000Z"));
  });

  it("still prefers an explicit IC date written in the body", () => {
    const result = enrichProject(
      makeProject(),
      makeThread("IC posted: 3 March 2025\nrenders below", "Wed, 16 September 2026, 03:14:10 &#187;"),
      vendorLookups
    );
    const icDate = result.projectUpdate.icDate as Date;
    expect(icDate.getFullYear()).toBe(2025);
    expect(icDate.getMonth()).toBe(2);
    expect(icDate.getDate()).toBe(3);
  });

  it("does not invent an icDate for non interest-check projects", () => {
    const result = enrichProject(
      makeProject({ status: "GROUP_BUY" }),
      makeThread("Hello everyone, here are some renders.", "Wed, 16 September 2026, 03:14:10 &#187;"),
      vendorLookups
    );
    expect(result.projectUpdate.icDate).toBeUndefined();
  });

  it("leaves icDate alone when the OP has no timestamp", () => {
    const result = enrichProject(
      makeProject(),
      makeThread("Hello everyone, here are some renders.", null),
      vendorLookups
    );
    expect(result.projectUpdate.icDate).toBeUndefined();
  });

  it("never overwrites an icDate that is already set", () => {
    const existing = new Date("2024-01-05T00:00:00.000Z");
    const result = enrichProject(
      makeProject({ icDate: existing }),
      makeThread("Hello everyone.", "Wed, 16 September 2026, 03:14:10 &#187;"),
      vendorLookups
    );
    expect(result.projectUpdate.icDate).toBeUndefined();
  });
});
