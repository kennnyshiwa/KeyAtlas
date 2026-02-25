import { describe, it, expect } from "vitest";
import {
  validateGeekhackTopicUrl,
  buildGeekhackPrefillPayload,
  type ExtractedThread,
} from "./geekhack";

describe("validateGeekhackTopicUrl", () => {
  it("parses a valid topic URL", () => {
    const result = validateGeekhackTopicUrl(
      "https://geekhack.org/index.php?topic=12345.0"
    );
    expect(result).toEqual({
      topicId: "12345",
      normalizedUrl: "https://geekhack.org/index.php?topic=12345.0",
    });
  });

  it("extracts topic id even with msg suffix", () => {
    const result = validateGeekhackTopicUrl(
      "https://geekhack.org/index.php?topic=99999.msg123456"
    );
    expect(result).toEqual({
      topicId: "99999",
      normalizedUrl: "https://geekhack.org/index.php?topic=99999.0",
    });
  });

  it("rejects non-geekhack URLs", () => {
    expect(validateGeekhackTopicUrl("https://reddit.com/r/mk")).toBeNull();
  });

  it("rejects URLs without topic param", () => {
    expect(validateGeekhackTopicUrl("https://geekhack.org/index.php")).toBeNull();
  });

  it("rejects garbage input", () => {
    expect(validateGeekhackTopicUrl("not a url")).toBeNull();
  });
});

describe("buildGeekhackPrefillPayload", () => {
  const thread: ExtractedThread = {
    sourceUrl: "https://geekhack.org/index.php?topic=123.0",
    fetchedAt: "2025-01-01T00:00:00Z",
    topicId: "123",
    title: "GMK Test",
    canonicalUrl: "https://geekhack.org/index.php?topic=123.0",
    op: {
      messageId: "1",
      postNumber: 1,
      author: "designer",
      timestamp: "Jan 01, 2025",
      contentHtml: "<p>Hello world</p>",
      contentText: "Hello world",
      links: ["https://example.com"],
      imageUrls: ["https://img.example.com/1.jpg"],
    },
    posts: [],
    metadata: {
      postCount: 1,
      uniqueAuthors: 1,
      allLinks: ["https://example.com"],
      allImageUrls: ["https://img.example.com/1.jpg"],
    },
  };

  it("builds correct prefill shape", () => {
    const result = buildGeekhackPrefillPayload(thread);
    expect(result.title).toBe("GMK Test");
    expect(result.category).toBe("KEYCAPS");
    expect(result.status).toBe("INTEREST_CHECK");
    expect(result.links).toHaveLength(1);
    expect(result.links[0].type).toBe("GEEKHACK");
    expect(result.images).toHaveLength(1);
    expect(result.description).toContain("Hello world");
  });

  it("uses tags geekhack and ic", () => {
    const result = buildGeekhackPrefillPayload(thread);
    expect(result.tags).toContain("geekhack");
    expect(result.tags).toContain("ic");
  });
});
