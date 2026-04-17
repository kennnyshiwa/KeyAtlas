/**
 * geekhack-scanner.test.ts
 *
 * Tests for:
 *  - parseTopicsFromBoardHtml: extracts topic entries from SMF board HTML
 *  - parseSubBoardIds: extracts child board IDs from SMF board HTML
 *  - normalizeTitleForDedup: strips IC/GB prefixes for dedup comparison
 */

import { describe, it, expect } from "vitest";
import {
  parseTopicsFromBoardHtml,
  parseSubBoardIds,
  normalizeTitleForDedup,
  isJunkTitle,
} from "./geekhack-scanner";

// ── Realistic mock board HTML ─────────────────────────────────────────────────
//
// This mirrors the structure Geekhack/SMF renders for board listing pages:
//  - Sub-boards listed at the top
//  - Topics in the main message index table
//
const MOCK_BOARD_HTML = `
<!DOCTYPE html>
<html>
<head><title>Interest Checks - Geekhack</title></head>
<body>
<div id="bodyarea">

  <!-- Sub-boards section -->
  <div class="board_row">
    <a href="https://geekhack.org/index.php?board=71.0">Artisan ICs</a>
    <a href="https://geekhack.org/index.php?board=72.0">Switch ICs</a>
    <!-- current board link should not be double-counted -->
    <a href="https://geekhack.org/index.php?board=70.0">Interest Checks</a>
  </div>

  <!-- Message index (topic list) -->
  <div id="messageindex">
    <div class="topic_row">
      <span class="subject">
        <a href="https://geekhack.org/index.php?topic=123456.0">[IC] DSA Magic Girl</a>
      </span>
    </div>
    <div class="topic_row">
      <span class="subject">
        <a href="https://geekhack.org/index.php?topic=123457.0">[IC] GMK Banana Split</a>
      </span>
    </div>
    <div class="topic_row">
      <span class="subject">
        <a href="https://geekhack.org/index.php?topic=123458.0">KAT Milkshake</a>
      </span>
    </div>
    <!-- Duplicate topic link (different hash) — should be deduplicated -->
    <div class="topic_row">
      <span class="subject">
        <a href="https://geekhack.org/index.php?topic=123456.15">[IC] DSA Magic Girl</a>
      </span>
    </div>
    <!-- Reply pagination link — title is just a number, should be skipped -->
    <a href="https://geekhack.org/index.php?topic=123456.20">20</a>
  </div>

  <!-- Pagination -->
  <div class="pagesection">
    <a href="https://geekhack.org/index.php?board=70.20">2</a>
    <a href="https://geekhack.org/index.php?board=70.40">3</a>
  </div>

</div>
</body>
</html>
`;

// ── parseTopicsFromBoardHtml ──────────────────────────────────────────────────

describe("parseTopicsFromBoardHtml", () => {
  it("extracts topic entries with correct topicId, title, boardId, and url", () => {
    const topics = parseTopicsFromBoardHtml(MOCK_BOARD_HTML, 70);

    expect(topics.length).toBeGreaterThanOrEqual(3);

    const ids = topics.map((t) => t.topicId);
    expect(ids).toContain("123456");
    expect(ids).toContain("123457");
    expect(ids).toContain("123458");
  });

  it("deduplicates topics that appear multiple times (same topicId, different offsets)", () => {
    const topics = parseTopicsFromBoardHtml(MOCK_BOARD_HTML, 70);
    const ids = topics.map((t) => t.topicId);

    // 123456 appears twice in the HTML (offset .0 and .15) — should only be once
    expect(ids.filter((id) => id === "123456").length).toBe(1);
  });

  it("sets correct boardId on all entries", () => {
    const topics = parseTopicsFromBoardHtml(MOCK_BOARD_HTML, 70);
    for (const t of topics) {
      expect(t.boardId).toBe(70);
    }
  });

  it("builds correct canonical url using .0 offset", () => {
    const topics = parseTopicsFromBoardHtml(MOCK_BOARD_HTML, 70);
    const magic = topics.find((t) => t.topicId === "123456");
    expect(magic?.url).toBe("https://geekhack.org/index.php?topic=123456.0");
  });

  it("skips links where the title text is just a number (pagination links)", () => {
    const topics = parseTopicsFromBoardHtml(MOCK_BOARD_HTML, 70);
    const ids = topics.map((t) => t.topicId);

    // The pagination link "20" anchored to topic=123456.20 should be deduped
    // (123456 already seen) but even if it were a new ID, it would be skipped
    // because the title "20" is numeric-only.
    // We just verify the count is reasonable (3 unique real topics).
    expect(ids.length).toBe(3);
  });

  it("returns empty array for HTML with no topic links", () => {
    const topics = parseTopicsFromBoardHtml("<html><body>No topics here</body></html>", 70);
    expect(topics).toHaveLength(0);
  });

  it("skips explicitly ignored Geekhack topic IDs", () => {
    const html = `
      <div id="messageindex">
        <a href="https://geekhack.org/index.php?topic=19878.0">NIB IBM 122 key terminal emulators</a>
        <a href="https://geekhack.org/index.php?topic=16830.0">team liquid key</a>
        <a href="https://geekhack.org/index.php?topic=21961.0">[Intrest Check] Finger Print function key</a>
        <a href="https://geekhack.org/index.php?topic=123999.0">[IC] Totally Real Keyboard</a>
      </div>
    `;

    const topics = parseTopicsFromBoardHtml(html, 70);
    expect(topics.map((t) => t.topicId)).toEqual(["123999"]);
  });
});

// ── parseSubBoardIds ──────────────────────────────────────────────────────────

describe("parseSubBoardIds", () => {
  it("extracts sub-board IDs from board page HTML", () => {
    const ids = parseSubBoardIds(MOCK_BOARD_HTML);
    expect(ids).toContain(71);
    expect(ids).toContain(72);
    expect(ids).toContain(70);
  });

  it("deduplicates board IDs", () => {
    const ids = parseSubBoardIds(MOCK_BOARD_HTML);
    const seen = new Set<number>();
    for (const id of ids) {
      expect(seen.has(id)).toBe(false);
      seen.add(id);
    }
  });

  it("returns empty array when no board links present", () => {
    const ids = parseSubBoardIds("<html><body><a href='?topic=1.0'>Topic</a></body></html>");
    expect(ids).toHaveLength(0);
  });
});

// ── normalizeTitleForDedup ────────────────────────────────────────────────────

describe("isJunkTitle", () => {
  it("flags the explicitly ignored IBM terminal emulator thread", () => {
    expect(isJunkTitle("NIB IBM 122 key terminal emulators")).toBe(true);
  });

  it("flags the explicitly ignored team liquid thread", () => {
    expect(isJunkTitle("team liquid key")).toBe(true);
  });

  it("flags the explicitly ignored finger print thread", () => {
    expect(isJunkTitle("[Intrest Check] Finger Print function key")).toBe(true);
  });
});

describe("normalizeTitleForDedup", () => {
  it("[IC] prefix stripped and lowercased", () => {
    expect(normalizeTitleForDedup("[IC] DSA Magic Girl")).toBe("dsa magic girl");
  });

  it("[GB] prefix stripped", () => {
    expect(normalizeTitleForDedup("[GB] GMK Olivia")).toBe("gmk olivia");
  });

  it("[GH] prefix stripped", () => {
    expect(normalizeTitleForDedup("[GH] Some Keycap Set")).toBe("some keycap set");
  });

  it("[Interest Check] prefix stripped", () => {
    expect(normalizeTitleForDedup("[Interest Check] KAT Milkshake")).toBe("kat milkshake");
  });

  it("[Group Buy] prefix stripped", () => {
    expect(normalizeTitleForDedup("[Group Buy] GMK Nord")).toBe("gmk nord");
  });

  it("IC prefix is case-insensitive", () => {
    expect(normalizeTitleForDedup("[ic] Something Cool")).toBe("something cool");
  });

  it("[IC] and [GB] variants of same board name match each other", () => {
    const ic = normalizeTitleForDedup("[IC] GMK Olivia");
    const gb = normalizeTitleForDedup("[GB] GMK Olivia");
    expect(ic).toBe(gb);
  });

  it("titles with no prefix are still normalised to lowercase", () => {
    expect(normalizeTitleForDedup("GMK Olivia")).toBe("gmk olivia");
  });

  it("case-insensitive match: 'gmk olivia' matches 'GMK Olivia'", () => {
    const a = normalizeTitleForDedup("gmk olivia");
    const b = normalizeTitleForDedup("GMK Olivia");
    expect(a).toBe(b);
  });

  it("different titles do NOT match", () => {
    const a = normalizeTitleForDedup("[IC] GMK Olivia");
    const b = normalizeTitleForDedup("[IC] GMK Nord");
    expect(a).not.toBe(b);
  });

  it("completely different titles produce different normalised values", () => {
    const a = normalizeTitleForDedup("DSA Magic Girl");
    const b = normalizeTitleForDedup("GMK Olivia");
    expect(a).not.toBe(b);
  });

  it("handles empty string gracefully", () => {
    expect(normalizeTitleForDedup("")).toBe("");
    expect(normalizeTitleForDedup("[IC]")).toBe("");
  });

  it("handles extra whitespace", () => {
    expect(normalizeTitleForDedup("  [IC]   DSA Magic Girl  ")).toBe("dsa magic girl");
  });
});
