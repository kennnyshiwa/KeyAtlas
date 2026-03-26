/**
 * geekhack-scanner.ts
 *
 * Scans Geekhack board listing pages to discover topic IDs, titles, and sub-boards.
 * Handles both top-level boards (IC=70, GB=132) and their nested sub-boards.
 */

export interface GeekhackTopicEntry {
  topicId: string;
  title: string;
  boardId: number;
  url: string;
}

const GH_BASE = "https://geekhack.org/index.php";
const TOPICS_PER_PAGE = 20;
const FETCH_TIMEOUT_MS = 15_000;

const USER_AGENT = "KeyAtlas Importer/1.0 (+https://keyatlas.app)";

/**
 * Titles (or substrings) that indicate meta/admin/rules posts — never real IC/GB topics.
 * Matched case-insensitively against the full title.
 */
const META_POST_PATTERNS = [
  /forum\s+terms\s+of\s+service/i,
  /\bTOS\b.*\*{2,}/i,
  /interest\s+check\s+forum\s*[-–—]?\s*please\s+read/i,
  /group\s+buy\s+rules\s+and\s+guidelines/i,
  /group\s+buy\s+faq/i,
  /buying\s+guidelines/i,
  /how\s+to\s+contact\s+a\s+group\s+buy/i,
  /\bPSA\b.*regarding\s+mechs/i,
  /important\s+information\s+regarding\s+mechs/i,
  /important\s+information\s+regarding\s+monoflex/i,
  /list\s+of\s+currently\s+running.*group\s+buys/i,
  /vendor\s+trust\s+and\s+safety\s+system/i,
  /someone\s+is\s+stealing\s+my\s+identity/i,
  /\bstolen\s+identity\b/i,
  /\bscam\s+alert\b/i,
  /\bwarning\b.*\bfraud\b/i,
];

/**
 * Titles that are clearly off-topic / junk — not actual IC/GB product topics.
 * These are casual posts, rants, memes, or non-product threads that sometimes
 * appear in IC/GB boards.
 */
const JUNK_TITLE_PATTERNS = [
  /^rip\b/i,                          // "rip bad internet", "rip my wallet" etc.
  /^(?:help|halp)\b/i,                // help requests, not products
  /^(?:wtb|wts|wtt)\b/i,             // want to buy/sell/trade — not IC/GB
  /^(?:lol|lmao|bruh)\b/i,           // meme posts
  /^looking\s+for\b/i,               // search requests
  /^anyone\s+(?:know|have|seen)\b/i,  // questions
  /^(?:rant|vent|complaint)\b/i,      // rants
  /\bshitpost\b/i,
];

/** Check if a title matches known meta/admin post patterns. */
export function isMetaPost(title: string): boolean {
  return META_POST_PATTERNS.some((pattern) => pattern.test(title));
}

/** Check if a title looks like off-topic junk rather than a real product. */
export function isJunkTitle(title: string): boolean {
  const stripped = title
    .replace(/^\s*\[(?:IC|GB|Interest Check|Group Buy)\]\s*/gi, "")
    .trim();
  return JUNK_TITLE_PATTERNS.some((pattern) => pattern.test(stripped));
}

/**
 * Normalise a topic title for dedup comparison:
 * Strip common IC/GB prefix tags, lowercase, trim.
 *
 * Examples:
 *   "[IC] DSA Magic Girl"  → "dsa magic girl"
 *   "[GB] GMK Olivia"      → "gmk olivia"
 *   "[Interest Check] ..." → ...
 */
export function normalizeTitleForDedup(title: string): string {
  return title
    .replace(/^\s*\[(?:IC|GB|GH|Interest Check|Group Buy)\]\s*/gi, "")
    .replace(/^\s*(?:Interest Check|Group Buy)\s*[:\-–—]?\s*/gi, "")
    .trim()
    .toLowerCase();
}

/**
 * Extract a "core name" from a title for fuzzy dedup.
 * Strips IC/GB tags, dates, status suffixes, and separators to get just the
 * product name so that "DCS Solar Green - GB Starts March 9th 2026" and
 * "DCS Solar Green 03/09 - 03/23/2026" both reduce to "dcs solar green".
 */
export function extractCoreName(title: string): string {
  return (
    title
      // Strip IC/GB prefix tags
      .replace(/^\s*\[(?:IC|GB|GH|Interest Check|Group Buy)\]\s*/gi, "")
      .replace(/^\s*(?:Interest Check|Group Buy)\s*[:\-–—]?\s*/gi, "")
      // Strip trailing date patterns: "03/09 - 03/23/2026", "March 9th 2026", "FEB 20 - MAR 13", etc.
      .replace(/\b\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?\s*[-–—]?\s*\d{0,2}[\/\-]?\d{0,2}[\/\-]?\d{0,4}\s*$/gi, "")
      .replace(/\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b[\s\S]*$/gi, "")
      // Strip GB/IC status phrases anywhere
      .replace(/\bGB\s+(?:starts?|live|now|soon|ends?|over|open|running)\b[\s\S]*/gi, "")
      .replace(/\bGroup\s+Buy\s+(?:starts?|live|now|soon|ends?|over|open|running)\b[\s\S]*/gi, "")
      .replace(/\b(?:shipping|shipped|delivered|in[- ]?stock|extras|production)\b[\s\S]*/gi, "")
      .replace(/\b(?:sets?\s+are\s+being)\b[\s\S]*/gi, "")
      .replace(/\b(?:launching|update|added|new renders)\b[\s\S]*/gi, "")
      // Strip common separators and trailing punctuation
      .replace(/\s*[|–—\-:]\s*$/g, "")
      // Collapse whitespace and trim
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase()
  );
}

/** Fetch raw HTML bytes and decode as UTF-8. */
async function fetchBoardPage(url: string): Promise<string> {
  const res = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { "user-agent": USER_AGENT },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching ${url}`);
  }
  return res.text();
}

/**
 * Parse topic entries from a Geekhack board listing HTML.
 *
 * SMF board listings render topics inside a <div id="messageindex"> section.
 * Each topic is a link like:
 *   <a href="https://geekhack.org/index.php?topic=12345.0">Title text</a>
 *
 * We extract topic ID + cleaned title from each match.
 */
/**
 * Extract topic IDs from sticky/pinned rows (marked with "stickybg" class in SMF).
 * These are rules, guidelines, and meta posts — not actual IC/GB topics.
 */
export function parseStickyTopicIds(html: string): Set<string> {
  const stickyIds = new Set<string>();
  // Split HTML by <tr to get table rows, check each for stickybg class
  const rows = html.split(/<tr\b/i);
  for (const row of rows) {
    if (/stickybg/i.test(row)) {
      const topicMatch = row.match(/topic=(\d+)\.\d+/);
      if (topicMatch) {
        stickyIds.add(topicMatch[1]);
      }
    }
  }
  return stickyIds;
}

export function parseTopicsFromBoardHtml(html: string, boardId: number): GeekhackTopicEntry[] {
  const entries: GeekhackTopicEntry[] = [];
  const seen = new Set<string>();

  // Restrict parsing to the topic listing section (#messageindex) to avoid
  // picking up topic links from news banners, post previews, etc.
  const messageIndexStart = html.indexOf('id="messageindex"');
  const scopedHtml = messageIndexStart !== -1 ? html.slice(messageIndexStart) : html;

  // Identify sticky/pinned topics to skip (rules, guidelines, meta posts)
  const stickyIds = parseStickyTopicIds(scopedHtml);

  // Match topic links: URLs may contain PHPSESSID and &amp; encoding
  // e.g. href="...?PHPSESSID=xxx&amp;topic=12345.0"  or  href="...?topic=12345.0"
  const topicLinkRe = /href=["'][^"']*(?:\?|&amp;|&)topic=(\d+)\.\d+[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of scopedHtml.matchAll(topicLinkRe)) {
    const topicId = match[1];
    const rawTitle = match[2]
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\s+/g, " ")
      .trim();

    if (!topicId || !rawTitle) continue;
    if (seen.has(topicId)) continue;

    // Skip sticky/pinned topics (rules, guidelines, etc.)
    if (stickyIds.has(topicId)) continue;

    // Skip non-topic anchors — SMF sometimes reuses href?topic= in pagination/nav
    // Filter: title must be meaningful (len > 2) and not a number-only string
    if (rawTitle.length <= 2 || /^\d+$/.test(rawTitle)) continue;

    // Skip known meta/admin posts by title pattern
    if (isMetaPost(rawTitle)) continue;

    // Skip junk/off-topic titles
    if (isJunkTitle(rawTitle)) continue;

    seen.add(topicId);
    entries.push({
      topicId,
      title: rawTitle,
      boardId,
      url: `${GH_BASE}?topic=${topicId}.0`,
    });
  }

  return entries;
}

/**
 * Parse sub-board IDs linked from a board page.
 *
 * SMF renders child board links like:
 *   <a href="https://geekhack.org/index.php?board=71.0">Sub-board Name</a>
 */
export function parseSubBoardIds(html: string): number[] {
  const ids: number[] = [];
  const seen = new Set<number>();

  const re = /href=["'][^"']*(?:\?|&amp;|&)board=(\d+)\.\d+[^"']*["']/gi;
  for (const match of html.matchAll(re)) {
    const id = parseInt(match[1], 10);
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }

  return ids;
}

/**
 * Scan a single board for topics across multiple pages.
 *
 * @param boardId   - SMF board ID (e.g. 70 for IC, 132 for GB)
 * @param maxPages  - How many listing pages to fetch (default 3 = up to 60 topics)
 */
export async function scanBoardPages(
  boardId: number,
  maxPages = 3
): Promise<{ topics: GeekhackTopicEntry[]; subBoardIds: number[] }> {
  const topics: GeekhackTopicEntry[] = [];
  const seen = new Set<string>();
  let subBoardIds: number[] = [];
  let subBoardsParsed = false;

  for (let page = 0; page < maxPages; page++) {
    const offset = page * TOPICS_PER_PAGE;
    const url = `${GH_BASE}?board=${boardId}.${offset}`;

    let html: string;
    try {
      html = await fetchBoardPage(url);
    } catch (err) {
      console.error(`[geekhack-scanner] Failed to fetch board ${boardId} page ${page}:`, err);
      break;
    }

    // Parse sub-boards only once (from the first page), excluding the current board
    if (!subBoardsParsed) {
      subBoardIds = parseSubBoardIds(html).filter((id) => id !== boardId);
      subBoardsParsed = true;
    }

    const pageTopics = parseTopicsFromBoardHtml(html, boardId);
    for (const t of pageTopics) {
      if (!seen.has(t.topicId)) {
        seen.add(t.topicId);
        topics.push(t);
      }
    }

    // Stop early if we got fewer topics than a full page
    if (pageTopics.length < TOPICS_PER_PAGE) break;
  }

  return { topics, subBoardIds };
}

/**
 * Scan a top-level board AND all its discovered sub-boards.
 *
 * @param boardId   - Top-level SMF board ID
 * @param maxPages  - Pages per board (applied to top-level and each sub-board)
 */
export async function scanBoardForTopics(
  boardId: number,
  maxPages = 3
): Promise<GeekhackTopicEntry[]> {
  const allTopics: GeekhackTopicEntry[] = [];
  const seen = new Set<string>();
  const visitedBoards = new Set<number>();

  // Helper to add unique topics
  const addTopics = (topics: GeekhackTopicEntry[]) => {
    for (const t of topics) {
      if (!seen.has(t.topicId)) {
        seen.add(t.topicId);
        allTopics.push(t);
      }
    }
  };

  // Scan top-level board first
  visitedBoards.add(boardId);
  const { topics: topLevelTopics, subBoardIds } = await scanBoardPages(boardId, maxPages);
  addTopics(topLevelTopics);

  // Scan each discovered sub-board (1 level deep — GH structure is shallow)
  for (const subId of subBoardIds) {
    if (visitedBoards.has(subId)) continue;
    visitedBoards.add(subId);

    try {
      const { topics: subTopics } = await scanBoardPages(subId, maxPages);
      addTopics(subTopics);
    } catch (err) {
      console.error(`[geekhack-scanner] Error scanning sub-board ${subId}:`, err);
    }
  }

  return allTopics;
}
