/**
 * geekhack-auto-import.ts
 *
 * Orchestrates automated discovery and import of new Geekhack IC/GB topics
 * as published KeyAtlas projects.
 *
 * Flow:
 *   1. Scan IC board (70) + GB board (132) and their sub-boards
 *   2. Dedup against existing projects (by URL and by normalised title)
 *   3. Fetch full thread, build prefill, mirror images
 *   4. Create project in Postgres via Prisma
 *   5. Index in Meilisearch + fire watchlist notifications
 */

import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/slug";
import { indexProject } from "@/lib/meilisearch";
import { notifyWatchlistMatches } from "@/lib/notifications/watchlist";
import {
  fetchGeekhackThread,
  buildGeekhackPrefillPayload,
  type ExtractedThread,
} from "@/lib/import/geekhack";
import {
  mirrorImgurImageSrcsInHtml,
  mirrorPrefillImages,
} from "@/lib/import/imgur-mirror";
import {
  scanBoardForTopics,
  normalizeTitleForDedup,
  extractCoreName,
  isMetaPost,
  isJunkTitle,
  type GeekhackTopicEntry,
} from "@/lib/import/geekhack-scanner";
import { notifyGoogleIndexing, notifyGoogleOfSitemap } from "@/lib/google-indexing";
import {
  extractGeekhackTopicIdFromUrl,
  inferGeekhackLinkLabel,
  normalizeGeekhackUrl,
} from "@/lib/import/geekhack-links";
import type { ProjectCategory, ProjectStatus } from "@/generated/prisma/client";

// ── Board IDs ────────────────────────────────────────────────────────────────
const IC_BOARD_ID = 70;
const GB_BOARD_ID = 132;

// ── Rate-limiting ─────────────────────────────────────────────────────────────
const DELAY_BETWEEN_FETCHES_MS = 3_000;
const RETRY_THIN_THREAD_FETCH_DELAY_MS = 1_500;
const MIN_IMPORT_CONTENT_CHARS = 100;

// ── HTML entity decoding ──────────────────────────────────────────────────────

/** Decode numeric and common named HTML entities in a string (for titles). */
function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&#(\d+);/g, (_m, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

/**
 * Infer project status from the topic title.
 * Title prefixes like [GB], [Group Buy] override the board-based default.
 */
function inferStatusFromTitle(title: string, boardDefault: ProjectStatus): ProjectStatus {
  const t = title.trim();
  if (/^\s*\[GB\]/i.test(t) || /^\s*\[Group\s+Buy\]/i.test(t) || /\bGB\b.*\b(live|open|starts?|running)\b/i.test(t) || /\bGroup\s+Buy\b.*\b(live|open|starts?|soon)\b/i.test(t)) {
    return "GROUP_BUY";
  }
  if (/^\s*\[IC\]/i.test(t) || /^\s*\[Interest\s+Check\]/i.test(t)) {
    return "INTEREST_CHECK";
  }
  if (/\b(pre-?order|preorder)\b/i.test(t)) {
    return "GROUP_BUY";
  }
  if (/\b(in[- ]stock|extras)\b/i.test(t)) {
    return "EXTRAS";
  }
  return boardDefault;
}

/**
 * Infer project category from the topic title and OP content.
 *
 * Keycap manufacturer prefixes (GMK, SA, DSA, KAT, etc.) are strong signals.
 * Keyboard-related terms (layout sizes, PCB, plate, case, etc.) indicate KEYBOARDS.
 * Other categories have their own keyword patterns.
 */
function inferCategory(title: string, contentText?: string): ProjectCategory {
  const t = title.toLowerCase();
  const c = (contentText ?? "").toLowerCase();
  // Combine for pattern matching — title is weighted more heavily
  const combined = `${t} ||| ${c}`;

  // ── KEYCAPS: keycap set manufacturer prefixes are a very strong signal ─────
  const keycapPrefixes =
    /\b(gmk|gmk\s*cyl|sa|dsa|dcs|dss|kat|kam|mt3|mda|cherry|oem|xda|moa|msa|osa|hsa|pbt\s*fans|pbtfans|key\s*kobo|keykobo|kkb|mw\s|pbs|epbt|bow|wob)\b/i;
  if (keycapPrefixes.test(t)) return "KEYCAPS";

  // Explicit keycap terms in title
  if (/\b(keycap|keycaps|keyset|key\s*set|key\s*caps?|doubleshot|dye[- ]?sub|legends?|alphas?|novelties|modifiers)\b/i.test(t))
    return "KEYCAPS";

  // ── DESKMATS ───────────────────────────────────────────────────────────────
  if (/\b(deskmat|desk\s*mat|deskpad|desk\s*pad|mousepad|mouse\s*pad)\b/i.test(combined))
    return "DESKMATS";

  // ── SWITCHES ───────────────────────────────────────────────────────────────
  if (/\b(switch|switches|linear|tactile|clicky|lubed|spring\s*swap|frankenswitch)\b/i.test(t))
    return "SWITCHES";

  // ── ARTISANS ───────────────────────────────────────────────────────────────
  if (/\b(artisan|artisans|resin|sculpt|keycap\s*sculpt)\b/i.test(t))
    return "ARTISANS";

  // ── ACCESSORIES ────────────────────────────────────────────────────────────
  if (/\b(cable|cables|coiled\s*cable|aviator|lemo|usb[- ]?c\s*cable|wrist\s*rest|carrying\s*case|foam|stabilizer|stab|lube|spring)\b/i.test(t))
    return "ACCESSORIES";

  // ── KEYBOARDS: layout sizes, board names, construction terms ───────────────
  // Common layout percentages and form factors
  if (/\b(keyboard|60%|65%|75%|80%|96%|tkl|full[- ]?size|hhkb|alice|split|ortho|ortholinear|ergo|ergonomic|40%|40s|numpad|macropad|southpaw)\b/i.test(t))
    return "KEYBOARDS";

  // Board construction terms in title
  if (/\b(pcb|plate|gasket|top[- ]?mount|bottom[- ]?mount|tray[- ]?mount|sandwich|o[- ]?ring|hotswap|hot[- ]?swap|soldered|wireless|bluetooth|via|qmk|zmk)\b/i.test(t))
    return "KEYBOARDS";

  // Common board size shorthand in product names (e.g. "Parabolica60", "Shy60", "Obey65")
  if (/\d{2}(?:xt|x|s|v\d)?\b/i.test(t) && /\b(board|mount|plate|pcb|layout|typing|build)\b/i.test(combined))
    return "KEYBOARDS";

  // If title ends with a number that looks like a size (40, 60, 65, 75, 80, etc.) and
  // content mentions keyboard-related terms, it's probably a keyboard
  if (/(?:40|60|65|67|68|75|80|84|87|96|100|104)\b/.test(t) && /\b(keyboard|typing|switch|mount|plate|pcb|case|build)\b/i.test(c))
    return "KEYBOARDS";

  // ── Fallback: check content for category signals ───────────────────────────
  if (keycapPrefixes.test(c.slice(0, 500))) return "KEYCAPS";
  if (/\b(keyboard|custom\s*keyboard|mechanical\s*keyboard)\b/i.test(c.slice(0, 500)))
    return "KEYBOARDS";

  // Default to KEYCAPS since IC/GB boards are predominantly keycap sets
  return "KEYCAPS";
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function getThreadBodyTextLength(thread: ExtractedThread | null | undefined): number {
  return thread?.op?.contentText
    ?.replace(/\s+/g, " ")
    .trim()
    .length ?? 0;
}

export async function fetchGeekhackThreadWithRetry(
  topicUrl: string,
  opts?: {
    attempts?: number;
    minContentChars?: number;
    delayMs?: number;
    fetcher?: (topicUrl: string) => Promise<ExtractedThread>;
    sleeper?: (ms: number) => Promise<void>;
    onRetry?: (info: { attempt: number; attempts: number; contentChars: number; topicUrl: string }) => void;
  }
): Promise<ExtractedThread> {
  const attempts = Math.max(1, opts?.attempts ?? 2);
  const minContentChars = opts?.minContentChars ?? MIN_IMPORT_CONTENT_CHARS;
  const fetcher = opts?.fetcher ?? fetchGeekhackThread;
  const sleeper = opts?.sleeper ?? sleep;
  const delayMs = opts?.delayMs ?? RETRY_THIN_THREAD_FETCH_DELAY_MS;

  let lastThread: ExtractedThread | null = null;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const thread = await fetcher(topicUrl);
    lastThread = thread;

    const contentChars = getThreadBodyTextLength(thread);
    if (contentChars >= minContentChars || attempt === attempts) {
      return thread;
    }

    opts?.onRetry?.({ attempt, attempts, contentChars, topicUrl });

    if (delayMs > 0) {
      await sleeper(delayMs);
    }
  }

  if (!lastThread) {
    throw new Error(`Failed to fetch Geekhack thread: ${topicUrl}`);
  }

  return lastThread;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isDecorativeImportedImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const lowerPath = parsed.pathname.toLowerCase();

    if (lowerPath.includes("/smileys/")) return true;
    if (/\/themes\/[^/]+\/images\//i.test(lowerPath)) return true;
    if (parsed.hostname.includes("tapatalk-cdn.com") && lowerPath.includes("emoji")) return true;

    return false;
  } catch {
    return false;
  }
}

function isTrustedImportedImageHost(url: string): boolean {
  try {
    const parsed = new URL(url);

    if (parsed.hostname === "localhost" || parsed.pathname.startsWith("/uploads/")) return true;
    if (parsed.hostname.includes("imagedelivery.net")) return true;
    if (parsed.hostname === "i.postimg.cc") return true;

    return false;
  } catch {
    return false;
  }
}

/**
 * HEAD-check a URL to verify it returns a valid image response.
 * Returns true if the URL is reachable and returns an image content-type.
 */
async function isImageUrlReachable(url: string): Promise<boolean> {
  try {
    if (isTrustedImportedImageHost(url)) return true;

    const res = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(8_000),
      headers: { "user-agent": "KeyAtlas Image Check/1.0" },
      redirect: "follow",
    });

    if (!res.ok) return false;

    const ct = res.headers.get("content-type") ?? "";
    return ct.startsWith("image/");
  } catch {
    return false;
  }
}

export async function stripBrokenImageBlocksFromHtml(
  html: string,
  isReachable: (url: string) => Promise<boolean> = isImageUrlReachable
): Promise<string> {
  if (!html.trim()) return html;

  const imageUrls = [...new Set(Array.from(html.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi), (m) => m[1]))]
    .filter(Boolean)
    .filter((url) => !isDecorativeImportedImageUrl(url));

  let cleaned = html;

  for (const url of imageUrls) {
    if (isTrustedImportedImageHost(url)) continue;
    if (await isReachable(url)) continue;

    const escapedUrl = escapeRegExp(url);
    const linkedImagePattern = new RegExp(
      `<a\\b[^>]*href=["']${escapedUrl}["'][^>]*>\\s*<img\\b[^>]*src=["']${escapedUrl}["'][^>]*\\/?>(?:\\s*</a>)?`,
      "gi"
    );
    const imagePattern = new RegExp(`<img\\b[^>]*src=["']${escapedUrl}["'][^>]*\\/?>`, "gi");

    cleaned = cleaned.replace(linkedImagePattern, "");
    cleaned = cleaned.replace(imagePattern, "");
  }

  return cleaned
    .replace(/(?:<br\s*\/?>\s*){3,}/gi, "<br /><br />")
    .replace(/(<strong>[^<]+<\/strong>)<br \/><br \/>/gi, "$1<br />")
    .trim();
}

// ── Result summary type ───────────────────────────────────────────────────────
export interface AutoImportSummary {
  scanned: number;
  imported: number;
  skipped: number;
  errors: string[];
}

// ── Slug collision handling ───────────────────────────────────────────────────
async function uniqueSlug(base: string): Promise<string> {
  const candidate = slugify(base);

  const existing = await prisma.project.findUnique({ where: { slug: candidate }, select: { id: true } });
  if (!existing) return candidate;

  // Append suffix -2, -3, … until free
  for (let suffix = 2; suffix <= 99; suffix++) {
    const suffixed = `${candidate}-${suffix}`;
    const clash = await prisma.project.findUnique({ where: { slug: suffixed }, select: { id: true } });
    if (!clash) return suffixed;
  }

  // Fallback: append random 6-char hex
  return `${candidate}-${Math.random().toString(16).slice(2, 8)}`;
}

// ── Dedup helpers ─────────────────────────────────────────────────────────────

/** Normalised Geekhack topic URL: always ?topic=NNNN.0 */
async function getLatestImportedGeekhackTopicId(): Promise<number> {
  const links = await prisma.projectLink.findMany({
    where: { type: "GEEKHACK" },
    select: { url: true },
  });

  let maxTopicId = 0;
  for (const link of links) {
    const topicId = extractGeekhackTopicIdFromUrl(link.url);
    if (!topicId) continue;

    const parsed = Number(topicId);
    if (Number.isFinite(parsed) && parsed > maxTopicId) {
      maxTopicId = parsed;
    }
  }

  return maxTopicId;
}

async function findProjectIdByGeekhackTopicId(topicId: string): Promise<string | null> {
  const existing = await prisma.projectLink.findFirst({
    where: {
      type: "GEEKHACK",
      OR: [
        { url: normalizeGeekhackUrl(topicId) },
        { url: { contains: `topic=${topicId}.` } },
        { url: { contains: `topic=${topicId}` } },
      ],
    },
    select: { projectId: true },
  });

  return existing?.projectId ?? null;
}

async function attachGeekhackLinkToProject(
  projectId: string,
  url: string,
  projectStatus: ProjectStatus
): Promise<"attached" | "already-linked"> {
  const topicId = extractGeekhackTopicIdFromUrl(url);
  const existing = await prisma.projectLink.findFirst({
    where: {
      projectId,
      type: "GEEKHACK",
      OR: topicId
        ? [
            { url },
            { url: { contains: `topic=${topicId}.` } },
            { url: { contains: `topic=${topicId}` } },
          ]
        : [{ url }],
    },
    select: { id: true },
  });

  if (existing) return "already-linked";

  await prisma.projectLink.create({
    data: {
      projectId,
      label: inferGeekhackLinkLabel(projectStatus),
      url,
      type: "GEEKHACK",
    },
  });

  return "attached";
}

/**
 * Check whether a Geekhack topic URL is already in project_links.
 * We check both the exact normalised URL and any URL containing the topic ID
 * to handle minor URL variations.
 */
async function isUrlAlreadyImported(topicId: string): Promise<boolean> {
  const normalised = normalizeGeekhackUrl(topicId);

  const existing = await prisma.projectLink.findFirst({
    where: {
      type: "GEEKHACK",
      OR: [
        { url: normalised },
        { url: { contains: `topic=${topicId}.` } },
        { url: { contains: `topic=${topicId}` } },
      ],
    },
    select: { id: true },
  });

  return existing !== null;
}

const TOKEN_STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "set",
  "with",
  "from",
  "edition",
  "base",
  "kit",
  "keycaps",
  "keycap",
  "project",
]);

const PRODUCT_FAMILY_STOPWORDS = new Set([
  ...TOKEN_STOPWORDS,
  "a",
  "an",
  "by",
  "of",
  "to",
  "on",
  "now",
  "new",
  "more",
  "choice",
  "choices",
  "bigger",
  "available",
  "live",
  "open",
  "opened",
  "opening",
  "starts",
  "start",
  "starting",
  "ends",
  "end",
  "ending",
  "until",
  "through",
  "update",
  "updates",
  "redefining",
  "sound",
  "customization",
  "premium",
  "affordable",
  "aluminum",
  "artisan",
  "artisans",
  "case",
  "cases",
  "display",
  "stand",
  "keyboard",
  "keyboards",
  "keycap",
  "keycaps",
  "pad",
  "pads",
  "sold",
  "out",
  "complete",
  "sale",
  "instock",
  "stock",
  "shipping",
  "shipped",
  "production",
  "manufacturing",
  "version",
  "versions",
  "project",
  "projects",
  "gb",
  "ic",
  "group",
  "buy",
  "interest",
  "check",
]);

const PROFILE_OR_FAMILY_TOKENS = new Set([
  "gmk",
  "sa",
  "dsa",
  "dcs",
  "dss",
  "kat",
  "kam",
  "mt3",
  "mda",
  "cherry",
  "oem",
  "xda",
  "moa",
  "msa",
  "osa",
  "hsa",
  "pbtfans",
  "epbt",
  "kkb",
  "keykobo",
  "pbs",
  "abs",
  "pbt",
]);

function tokenizeFingerprintKey(value: string): string[] {
  return value
    .split(/\s+/)
    .map((t) => t.replace(/[^a-z0-9]/gi, "").toLowerCase())
    .filter((t) => t.length >= 2)
    .filter((t) => !TOKEN_STOPWORDS.has(t));
}

export interface GeekhackTitleFingerprint {
  key: string;
  brandOrProfile: string[];
  productFamilyKey: string;
  rounds: string[];
  tokens: string[];
}

export interface GeekhackDuplicateCandidate {
  id: string;
  title: string;
  links: Array<{ url: string }>;
}

interface GeekhackDuplicateMatch {
  projectId: string;
  reason: "topic-lineage" | "title-fingerprint";
}

/**
 * Conservative fingerprint for lifecycle churn dedupe.
 * Keeps product-defining tokens (profile/material/round), strips status churn.
 */
export function buildGeekhackTitleFingerprint(title: string): GeekhackTitleFingerprint {
  const key = buildLifecycleStableTitleKey(title);
  const tokens = tokenizeFingerprintKey(key);
  const brandOrProfile = tokens.filter((t) => PROFILE_OR_FAMILY_TOKENS.has(t)).sort();
  const productFamilyKey = buildProductFamilyKey(title);
  const rounds = tokens.filter((t) => /^r\d{1,2}$/.test(t)).sort();

  return {
    key,
    brandOrProfile,
    productFamilyKey,
    rounds,
    tokens: Array.from(new Set(tokens)).sort(),
  };
}

function sortedJoin(values: string[]): string {
  return Array.from(new Set(values)).sort().join("|");
}

function tokenizeProductFamilyKey(value: string): string[] {
  return value
    .replace(/\+/g, "plus")
    .replace(/&/g, " ")
    .split(/[^a-z0-9]+/gi)
    .map((t) => t.toLowerCase())
    .filter((t) => t.length >= 2)
    .filter((t) => !PRODUCT_FAMILY_STOPWORDS.has(t))
    .filter((t) => !/^\d{1,2}(?:st|nd|rd|th)?$/.test(t))
    .filter((t) => !/^\d{1,2}x\d{1,2}$/.test(t));
}

function buildProductFamilyKey(title: string): string {
  return tokenizeProductFamilyKey(extractCoreName(title)).slice(0, 4).join(" ");
}

function hasStrongProductFamilyIdentity(key: string): boolean {
  return key
    .split(/\s+/)
    .filter(Boolean)
    .some((token) => /\d/.test(token) || token.includes("plus") || token.length >= 6);
}

function isTokenPrefixMatch(a: string, b: string): boolean {
  if (!a || !b) return false;

  const aTokens = a.split(/\s+/).filter(Boolean);
  const bTokens = b.split(/\s+/).filter(Boolean);
  const shorter = aTokens.length <= bTokens.length ? aTokens : bTokens;
  const longer = aTokens.length <= bTokens.length ? bTokens : aTokens;

  if (shorter.length === 0) return false;
  return shorter.every((token, idx) => longer[idx] === token);
}

/**
 * True only when we have a high-confidence lifecycle match.
 * Conservative by design: false negatives are preferred over false positives.
 */
export function isConservativeLifecycleDuplicate(aTitle: string, bTitle: string): boolean {
  const a = buildGeekhackTitleFingerprint(aTitle);
  const b = buildGeekhackTitleFingerprint(bTitle);
  if (!a.key || !b.key) return false;

  // Strong exact stable-key match first.
  if (a.key === b.key && a.key.length >= 8) return true;

  // Core-name match: aggressively strip lifecycle/date/status noise and compare.
  // This catches cases like "Typemaster 180 75% Premium Board" vs
  // "Typemaster 180 75% Magnetic Board - In Production" where a single descriptor
  // word changes between IC and GB threads.
  const coreA = extractCoreName(aTitle);
  const coreB = extractCoreName(bTitle);
  if (coreA && coreB && coreA.length >= 8 && coreA === coreB) return true;

  // Core-name token overlap: for short product names where a single word swap
  // (e.g. "premium" → "magnetic") drops Jaccard below 0.75, use a containment
  // check on core-name tokens instead.
  if (coreA && coreB) {
    const coreATokens = tokenizeFingerprintKey(coreA);
    const coreBTokens = tokenizeFingerprintKey(coreB);
    if (coreATokens.length >= 2 && coreBTokens.length >= 2) {
      const smaller = coreATokens.length <= coreBTokens.length ? coreATokens : coreBTokens;
      const larger = coreATokens.length <= coreBTokens.length ? new Set(coreBTokens) : new Set(coreATokens);
      const contained = smaller.filter((t) => larger.has(t)).length;
      // If the smaller core name is ≥80% contained in the larger one, it's likely
      // the same product with minor title evolution.
      if (smaller.length >= 2 && contained / smaller.length >= 0.8) {
        // Still respect brand/profile/round constraints
        if (sortedJoin(a.brandOrProfile) === sortedJoin(b.brandOrProfile) &&
            sortedJoin(a.rounds) === sortedJoin(b.rounds)) {
          return true;
        }
      }
    }
  }

  // Product-family prefix match: tolerate descriptive tail churn when the
  // core model/family anchor is clearly the same project.
  if (a.productFamilyKey && b.productFamilyKey) {
    if (
      sortedJoin(a.brandOrProfile) === sortedJoin(b.brandOrProfile) &&
      sortedJoin(a.rounds) === sortedJoin(b.rounds) &&
      isTokenPrefixMatch(a.productFamilyKey, b.productFamilyKey)
    ) {
      const shorterKey =
        a.productFamilyKey.length <= b.productFamilyKey.length
          ? a.productFamilyKey
          : b.productFamilyKey;

      if (hasStrongProductFamilyIdentity(shorterKey)) {
        return true;
      }
    }
  }

  // Keep product-defining signatures aligned (don't merge GMK vs SA, PBT vs ABS, R1 vs R2).
  if (sortedJoin(a.brandOrProfile) !== sortedJoin(b.brandOrProfile)) return false;
  if (sortedJoin(a.rounds) !== sortedJoin(b.rounds)) return false;

  const aTokens = new Set(a.tokens);
  const bTokens = new Set(b.tokens);
  const intersection = [...aTokens].filter((t) => bTokens.has(t));
  if (intersection.length < 2) return false;

  const unionSize = new Set([...a.tokens, ...b.tokens]).size;
  const jaccard = unionSize > 0 ? intersection.length / unionSize : 0;

  return jaccard >= 0.75;
}

const LIFECYCLE_NOISE_PATTERNS: RegExp[] = [
  /\b(?:ic|interest\s+check|gb|group\s+buy)\b/gi,
  /\b(?:final\s+ic|final\s+update|update|updates?)\b/gi,
  /\b(?:live|open|opened|opening|starts?|starting|running|ended|ending|closed|closing|phase\s*\d+)\b/gi,
  /\b(?:shipping|shipped|delivering|delivered|production|manufacturing|extras|in[-\s]?stock|pre[-\s]?order)\b/gi,
  /\b(?:now|soon|today|tomorrow)\b/gi,
  /\b\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?\b/g,
  /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/gi,
  /\b\d{4}\b/g,
];

/**
 * Build a conservative dedupe key that strips lifecycle churn but keeps product-defining tokens
 * (e.g. GMK vs SA, profile names, material words, collab names).
 */
export function buildLifecycleStableTitleKey(title: string): string {
  let v = normalizeTitleForDedup(title)
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/[(){}]/g, " ");

  for (const pattern of LIFECYCLE_NOISE_PATTERNS) {
    v = v.replace(pattern, " ");
  }

  return v
    .replace(/[|:/\\,!.]+/g, " ")
    .replace(/[-–—]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Check whether a project with a similar lifecycle-stable title already exists.
 * Conservative by design, but it must consider manual KeyAtlas projects too,
 * otherwise the importer can create a second copy of something Kenneth already made.
 */
async function isTitleAlreadyImported(rawTitle: string): Promise<boolean> {
  const needle = normalizeTitleForDedup(rawTitle);
  if (!needle) return false;

  const projects = await prisma.project.findMany({
    where: { published: true },
    select: { title: true },
  });

  return projects.some((p) => {
    const existing = normalizeTitleForDedup(p.title);
    if (needle && existing === needle) return true;
    return isConservativeLifecycleDuplicate(rawTitle, p.title);
  });
}

/**
 * Final pre-create brake: block import when an existing Geekhack project matches
 * by topic lineage first, then conservative lifecycle fingerprint.
 */
export function findHardDuplicateMatch(
  incoming: { topicId: string; title: string; sourceUrls?: string[] },
  candidates: GeekhackDuplicateCandidate[]
): GeekhackDuplicateMatch | null {
  const incomingTopicIds = new Set<string>();
  if (incoming.topicId) incomingTopicIds.add(incoming.topicId);
  for (const url of incoming.sourceUrls ?? []) {
    const topicId = extractGeekhackTopicIdFromUrl(url);
    if (topicId) incomingTopicIds.add(topicId);
  }

  // Primary identity: topic lineage from any known Geekhack URL form.
  if (incomingTopicIds.size > 0) {
    for (const candidate of candidates) {
      for (const link of candidate.links) {
        const candidateTopicId = extractGeekhackTopicIdFromUrl(link.url);
        if (candidateTopicId && incomingTopicIds.has(candidateTopicId)) {
          return { projectId: candidate.id, reason: "topic-lineage" };
        }
      }
    }
  }

  // Secondary identity: conservative lifecycle fingerprint match.
  for (const candidate of candidates) {
    if (isConservativeLifecycleDuplicate(incoming.title, candidate.title)) {
      return { projectId: candidate.id, reason: "title-fingerprint" };
    }
  }

  return null;
}

/**
 * Extract all Geekhack topic IDs referenced in HTML content (e.g. the OP body).
 * IC threads often link to their GB thread and vice versa — these cross-references
 * are a strong signal that the topics are the same project.
 */
function extractReferencedTopicIds(html: string): string[] {
  const ids = new Set<string>();
  // Match topic=NNNN patterns in href attributes and plain text URLs
  const re = /(?:topic=|topic%3D)(\d+)/gi;
  for (const m of html.matchAll(re)) {
    ids.add(m[1]);
  }
  return [...ids];
}

// ── Per-topic import logic ────────────────────────────────────────────────────
async function importTopic(
  entry: GeekhackTopicEntry,
  inferredStatus: ProjectStatus,
  creatorId: string
): Promise<{ imported: boolean; error?: string }> {
  const logPrefix = `[geekhack-auto-import] topic=${entry.topicId}`;

  // 1. Dedup by URL
  if (await isUrlAlreadyImported(entry.topicId)) {
    console.log(`${logPrefix} skipped (URL already imported)`);
    return { imported: false };
  }

  // 2. Fetch full thread.
  // Intentionally do not short-circuit on listing-title matches here, because
  // a duplicate thread may still carry a newer Geekhack topic we want to attach
  // onto the existing KeyAtlas project for enrichment/display lineage.
  let thread;
  try {
    thread = await fetchGeekhackThreadWithRetry(entry.url, {
      onRetry: ({ attempt, attempts, contentChars }) => {
        console.warn(
          `${logPrefix} fetched suspiciously thin OP body (${contentChars} chars) on attempt ${attempt}/${attempts}, retrying`
        );
      },
    });
  } catch (err) {
    const msg = `Failed to fetch thread ${entry.url}: ${err instanceof Error ? err.message : String(err)}`;
    console.error(`${logPrefix} ${msg}`);
    return { imported: false, error: msg };
  }

  const canonicalTopicId = thread.topicId || entry.topicId;
  const ghUrl = normalizeGeekhackUrl(canonicalTopicId);

  // 3a. Cross-thread link check: if the OP references another Geekhack topic
  //     that we already imported, this is almost certainly the same project
  //     (e.g. an IC thread linking to its GB thread or vice versa).
  const opHtml = thread.op?.contentHtml ?? thread.op?.contentText ?? "";
  const referencedTopicIds = extractReferencedTopicIds(opHtml)
    .filter((id) => id !== entry.topicId && id !== canonicalTopicId);
  if (referencedTopicIds.length > 0) {
    for (const refId of referencedTopicIds) {
      const existingProjectId = await findProjectIdByGeekhackTopicId(refId);
      if (existingProjectId) {
        const linkAction = await attachGeekhackLinkToProject(existingProjectId, ghUrl, inferredStatus);
        console.log(
          `${logPrefix} skipped (OP cross-references already-imported topic=${refId}, existing project=${existingProjectId}, link=${linkAction})`
        );
        return { imported: false };
      }
    }
  }

  // 4. Build prefill
  const prefill = buildGeekhackPrefillPayload(thread);

  // 4a. Decode HTML entities in the title (e.g. &#12304; → 【)
  prefill.title = decodeHtmlEntities(prefill.title);

  // 4b. Re-check junk/meta after full-thread title extraction — the listing
  //     title (entry.title) and the parsed thread title can differ. Old topics
  //     often have listing titles like "[IC] Community Poll" that pass the
  //     scanner filter but whose parsed thread title reduces to just "Poll".
  if (isMetaPost(prefill.title) || isJunkTitle(prefill.title)) {
    console.log(`${logPrefix} skipped junk/meta prefill title: "${prefill.title}" (listing: "${entry.title}")`);
    return { imported: false };
  }

  // 5. Mirror images
  let mirroredDescription = prefill.description;
  try {
    mirroredDescription = await mirrorImgurImageSrcsInHtml(prefill.description, creatorId);
  } catch (err) {
    console.warn(`${logPrefix} image mirroring (description) failed:`, err);
  }

  try {
    mirroredDescription = await stripBrokenImageBlocksFromHtml(mirroredDescription);
  } catch (err) {
    console.warn(`${logPrefix} image cleanup (description) failed:`, err);
  }

  let mirroredImages = prefill.images;
  try {
    mirroredImages = await mirrorPrefillImages(prefill.images, creatorId);
  } catch (err) {
    console.warn(`${logPrefix} image mirroring (prefill images) failed:`, err);
  }

  // 6. Skip imports with no meaningful content
  // Cleanup SQL for existing junk imports (run manually):
  // DELETE FROM projects WHERE published = true AND tags @> ARRAY['geekhack'] AND (description IS NULL OR length(description) < 200);
  const plainTextLength = (mirroredDescription || "")
    .replace(/<[^>]*>/g, "")  // strip HTML tags
    .replace(/https?:\/\/\S+/g, "")  // strip URLs
    .trim()
    .length;

  if (plainTextLength < MIN_IMPORT_CONTENT_CHARS) {
    console.log(`${logPrefix} skipped (insufficient content: ${plainTextLength} chars)`);
    return { imported: false };
  }

  // 7. Validate image URLs — filter out broken ones, pick a working hero
  const validatedImages: typeof mirroredImages = [];
  for (const img of mirroredImages) {
    if (await isImageUrlReachable(img.url)) {
      validatedImages.push(img);
    } else {
      console.warn(`${logPrefix} skipping broken image: ${img.url}`);
    }
  }

  // 8. Infer category from title + OP content
  const category = inferCategory(prefill.title, thread.op?.contentText);

  // 9. Generate slug with collision handling
  const slug = await uniqueSlug(prefill.title);

  // 10. Build heroImage from first valid image
  const heroImage = validatedImages[0]?.url ?? null;

  // 11. Create project via Prisma — with atomic duplicate guard
  let project;
  try {
    // Final DB-level dedup check right before insert (prevents race conditions)
    const existingLink = await prisma.projectLink.findFirst({
      where: {
        type: "GEEKHACK",
        OR: [
          { url: ghUrl },
          { url: { contains: `topic=${canonicalTopicId}.` } },
          { url: { contains: `topic=${canonicalTopicId}` } },
        ],
      },
      select: { id: true },
    });
    if (existingLink) {
      console.log(`${logPrefix} skipped (URL already imported — final check)`);
      return { imported: false };
    }

    // Hard final dedupe gate: topic lineage + conservative fingerprint before insert.
    // Include manual published projects too, so a real KeyAtlas entry wins over a new auto-import.
    const duplicateCandidates = await prisma.project.findMany({
      where: {
        published: true,
      },
      select: {
        id: true,
        title: true,
        links: {
          where: { type: "GEEKHACK" },
          select: { url: true },
        },
      },
    });

    // Include cross-referenced topic URLs so the hard gate also catches
    // IC↔GB thread lineage links found in the OP body.
    const crossRefUrls = referencedTopicIds.map((id) => normalizeGeekhackUrl(id));
    const duplicateMatch = findHardDuplicateMatch(
      {
        topicId: canonicalTopicId,
        title: prefill.title,
        sourceUrls: [ghUrl, entry.url, ...crossRefUrls],
      },
      duplicateCandidates
    );

    if (duplicateMatch) {
      const linkAction = await attachGeekhackLinkToProject(
        duplicateMatch.projectId,
        ghUrl,
        inferredStatus
      );
      console.log(
        `${logPrefix} skipped (hard duplicate gate: ${duplicateMatch.reason}, existing project=${duplicateMatch.projectId}, link=${linkAction})`
      );
      return { imported: false };
    }

    project = await prisma.project.create({
      data: {
        title: prefill.title,
        slug,
        description: mirroredDescription || null,
        category,
        status: inferredStatus,
        heroImage,
        tags: ["geekhack", "auto-imported"],
        published: true,
        creatorId,
        images: {
          create: validatedImages.map((img, idx) => ({
            url: img.url,
            alt: img.alt ?? null,
            order: idx,
          })),
        },
        links: {
          create: [
            {
              label: inferGeekhackLinkLabel(inferredStatus),
              url: ghUrl,
              type: "GEEKHACK" as const,
            },
          ],
        },
      },
      include: {
        vendor: true,
      },
    });
  } catch (err) {
    // Slug collision is expected if a concurrent request already created this project
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Unique constraint")) {
      console.log(`${logPrefix} skipped (unique constraint — concurrent duplicate)`);
      return { imported: false };
    }
    console.error(`${logPrefix} DB create failed for "${prefill.title}": ${msg}`);
    return { imported: false, error: `DB create failed: ${msg}` };
  }

  console.log(`${logPrefix} imported as project id=${project.id} slug="${project.slug}" category=${category} status=${inferredStatus}`);

  // 12. Index in Meilisearch (non-fatal)
  try {
    await indexProject(project);
  } catch (err) {
    console.warn(`${logPrefix} Meilisearch indexing failed:`, err);
  }

  // 13. Watchlist notifications (non-fatal)
  try {
    await notifyWatchlistMatches({
      id: project.id,
      title: project.title,
      slug: project.slug,
      category: project.category,
      status: project.status,
      profile: project.profile,
      designer: project.designer,
      vendorId: project.vendorId,
      shipped: project.shipped,
      tags: project.tags,
      creatorId: project.creatorId,
    });
  } catch (err) {
    console.warn(`${logPrefix} watchlist notification failed:`, err);
  }

  // 14. Notify Google Indexing API (non-fatal)
  try {
    const projectUrl = `https://keyatlas.io/projects/${project.slug}`;
    await notifyGoogleIndexing(projectUrl);
  } catch (err) {
    console.warn(`${logPrefix} Google indexing notification failed:`, err);
  }

  return { imported: true };
}

// ── Concurrency lock (time-based, auto-expires after 10 min) ─────────────────
let _runningUntil = 0;
const LOCK_TTL_MS = 10 * 60 * 1000; // 10 minutes

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Run a full Geekhack board scan and auto-import new topics as projects.
 *
 * Returns a summary of what happened.
 */
export async function runGeekhackAutoImport(opts?: {
  /** Max new topics to actually import per run (default unlimited). Useful for testing. */
  maxImports?: number;
  /** Max board listing pages to scan per board (default 3). */
  maxPages?: number;
  /** Only consider topic IDs newer than this. Default: current latest imported Geekhack topic. */
  minTopicIdExclusive?: number;
}): Promise<AutoImportSummary> {
  // Prevent concurrent runs — lock auto-expires after LOCK_TTL_MS to avoid stuck state
  const now = Date.now();
  if (_runningUntil > now) {
    const remainSec = Math.round((_runningUntil - now) / 1000);
    console.warn(`[geekhack-auto-import] Already running (lock expires in ${remainSec}s) — skipping`);
    return { scanned: 0, imported: 0, skipped: 0, errors: ["Import already in progress"] };
  }
  _runningUntil = now + LOCK_TTL_MS;

  const maxImports = opts?.maxImports ?? Infinity;
  const maxPages = opts?.maxPages ?? 3;
  const minTopicIdExclusive = opts?.minTopicIdExclusive ?? (await getLatestImportedGeekhackTopicId());
  const creatorId =
    process.env.GEEKHACK_IMPORT_USER_ID ?? "cmlwzwwpn000001qpgnkb363r";

  try {
    return await _doImport(maxImports, maxPages, creatorId, minTopicIdExclusive);
  } finally {
    _runningUntil = 0;
  }
}

async function _doImport(
  maxImports: number,
  maxPages: number,
  creatorId: string,
  minTopicIdExclusive: number
): Promise<AutoImportSummary> {
  const summary: AutoImportSummary = {
    scanned: 0,
    imported: 0,
    skipped: 0,
    errors: [],
  };

  console.log("[geekhack-auto-import] Starting scan…");

  // ── Scan IC and GB boards (including sub-boards) ──────────────────────────
  const icTopics: GeekhackTopicEntry[] = [];
  const gbTopics: GeekhackTopicEntry[] = [];

  try {
    const topics = await scanBoardForTopics(IC_BOARD_ID, maxPages);
    icTopics.push(...topics);
    console.log(`[geekhack-auto-import] IC board: found ${topics.length} topics`);
  } catch (err) {
    const msg = `IC board scan failed: ${err instanceof Error ? err.message : String(err)}`;
    console.error("[geekhack-auto-import]", msg);
    summary.errors.push(msg);
  }

  try {
    const topics = await scanBoardForTopics(GB_BOARD_ID, maxPages);
    gbTopics.push(...topics);
    console.log(`[geekhack-auto-import] GB board: found ${topics.length} topics`);
  } catch (err) {
    const msg = `GB board scan failed: ${err instanceof Error ? err.message : String(err)}`;
    console.error("[geekhack-auto-import]", msg);
    summary.errors.push(msg);
  }

  // Combine with inferred status tags, deduplicating by topicId across boards
  const seenTopicIds = new Set<string>();
  const allWork: Array<{ entry: GeekhackTopicEntry; status: ProjectStatus }> = [];

  // IC topics first (so IC status takes priority if a topic appears in both)
  for (const e of icTopics) {
    if (!seenTopicIds.has(e.topicId)) {
      seenTopicIds.add(e.topicId);
      allWork.push({ entry: e, status: "INTEREST_CHECK" });
    }
  }
  for (const e of gbTopics) {
    if (!seenTopicIds.has(e.topicId)) {
      seenTopicIds.add(e.topicId);
      allWork.push({ entry: e, status: "GROUP_BUY" });
    }
  }

  const filteredWork = minTopicIdExclusive > 0
    ? allWork.filter(({ entry }) => Number(entry.topicId) > minTopicIdExclusive)
    : allWork;

  summary.scanned = filteredWork.length;
  console.log(
    `[geekhack-auto-import] Total unique topics to evaluate: ${summary.scanned}` +
      (minTopicIdExclusive > 0
        ? ` (recent-only, topicId > ${minTopicIdExclusive}; filtered out ${allWork.length - filteredWork.length} older topics)`
        : "")
  );

  // ── Process topics one at a time with rate-limiting ───────────────────────
  // In-memory dedup to prevent duplicates within a single run
  const importedThisRun = new Set<string>();

  for (let i = 0; i < filteredWork.length; i++) {
    const { entry, status } = filteredWork[i];

    // Skip meta/admin posts that slipped through the scanner
    if (isMetaPost(entry.title)) {
      summary.skipped++;
      continue;
    }

    // Skip junk/off-topic titles (rants, memes, non-product posts)
    if (isJunkTitle(entry.title)) {
      console.log(`[geekhack-auto-import] skipped junk title: "${entry.title}"`);
      summary.skipped++;
      continue;
    }

    // In-memory dedup (same run)
    if (importedThisRun.has(entry.topicId)) {
      summary.skipped++;
      continue;
    }

    // DB-level URL dedup check before fetching the full thread.
    // Do not short-circuit on title here: a same-project newer GH thread may
    // need to be attached to an existing KeyAtlas project as a secondary link.
    const topicIdFromListingUrl = extractGeekhackTopicIdFromUrl(entry.url) || entry.topicId;
    const urlDup = await isUrlAlreadyImported(topicIdFromListingUrl);

    if (urlDup) {
      summary.skipped++;
      continue;
    }

    // Stop if we've hit the import cap
    if (summary.imported >= maxImports) {
      summary.skipped++;
      continue;
    }

    // Infer status from title prefix (overrides board-based default)
    const finalStatus = inferStatusFromTitle(entry.title, status);

    // Rate limit: wait before each fetch (except the very first)
    if (i > 0) {
      await sleep(DELAY_BETWEEN_FETCHES_MS);
    }

    const result = await importTopic(entry, finalStatus, creatorId);

    if (result.imported) {
      summary.imported++;
      importedThisRun.add(entry.topicId);
    } else if (result.error) {
      summary.skipped++;
      summary.errors.push(result.error);
    } else {
      summary.skipped++;
    }
  }

  console.log(
    `[geekhack-auto-import] Done. scanned=${summary.scanned} imported=${summary.imported} skipped=${summary.skipped} errors=${summary.errors.length}`
  );

  // Resubmit sitemap if any projects were imported
  if (summary.imported > 0) {
    try {
      await notifyGoogleOfSitemap();
    } catch (err) {
      console.warn("[geekhack-auto-import] Sitemap resubmit failed:", err);
    }
  }

  return summary;
}
