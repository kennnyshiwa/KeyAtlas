import { describe, it, expect } from "vitest";
import {
  validateGeekhackTopicUrl,
  buildGeekhackPrefillPayload,
  convertGeekhackMoreBlocks,
  type ExtractedThread,
} from "./geekhack";
import { extractCoreName } from "./geekhack-scanner";

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

describe("extractCoreName", () => {
  it("strips bracket-wrapped status suffixes", () => {
    expect(extractCoreName("[IC] GMK Bingsu R2 [GB Starts July 7]")).toBe("gmk bingsu r2");
  });

  it("strips [NOW SHIPPING] suffix", () => {
    expect(extractCoreName("[GB] SA Dreameater [NOW SHIPPING]")).toBe("sa dreameater");
  });

  it("strips [Update: ...] suffix", () => {
    expect(extractCoreName("[IC] KAT Cyberspace [Update: New Renders]")).toBe("kat cyberspace");
  });

  it("handles simple IC prefix with no suffix", () => {
    expect(extractCoreName("[IC] GMK Phosphorous")).toBe("gmk phosphorous");
  });

  it("handles title with no prefix or suffix", () => {
    expect(extractCoreName("GMK CYL Desert Nights")).toBe("gmk cyl desert nights");
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

  it("converts Geekhack 'More' blocks in the OP into collapsible sections", () => {
    const result = buildGeekhackPrefillPayload({
      ...thread,
      op: {
        ...thread.op!,
        contentHtml:
          '<span class="bbc_size">Ice Blue</span><br />' +
          '<a href="https://i.imgur.com/c5rKmJ1.jpeg"><img src="https://i.imgur.com/c5rKmJ1.jpeg" /></a><br /><br />' +
          '<div class="more_head">More</div>' +
          '<div class="more_body">' +
          '<a href="https://i.imgur.com/x15j5Ms.jpeg"><img src="https://i.imgur.com/x15j5Ms.jpeg" /></a><br />' +
          '<a href="https://i.imgur.com/tERjb4w.jpeg"><img src="https://i.imgur.com/tERjb4w.jpeg" /></a>' +
          "</div>",
      },
    });

    expect(result.description).toContain('<details data-collapsible="true">');
    expect(result.description).toContain("<summary>More</summary>");
    expect(result.description).toContain('<div data-collapsible-content="true">');
    // Lead image and heading survive outside the collapsible block.
    expect(result.description).toContain("Ice Blue");
    expect(result.description).toContain("c5rKmJ1.jpeg");
    // Hidden images moved inside the collapsible content.
    expect(result.description).toContain("x15j5Ms.jpeg");
    expect(result.description).toContain("tERjb4w.jpeg");
    // Original Geekhack markup is gone.
    expect(result.description).not.toContain("more_head");
    expect(result.description).not.toContain("more_body");
  });
});

describe("convertGeekhackMoreBlocks", () => {
  it("preserves nested divs inside the more_body", () => {
    const html =
      '<div class="more_head">More</div>' +
      '<div class="more_body"><div class="inner">deep</div>tail</div>after';
    const result = convertGeekhackMoreBlocks(html);

    expect(result).toBe(
      '<details data-collapsible="true"><summary>More</summary>' +
        '<div data-collapsible-content="true"><div class="inner">deep</div>tail</div></details>after'
    );
  });

  it("leaves a more_head with no following more_body untouched", () => {
    const html = '<div class="more_head">More</div><p>not a body</p>';
    expect(convertGeekhackMoreBlocks(html)).toBe(html);
  });

  it("returns input unchanged when there are no more blocks", () => {
    const html = "<p>Plain description</p>";
    expect(convertGeekhackMoreBlocks(html)).toBe(html);
  });
});
