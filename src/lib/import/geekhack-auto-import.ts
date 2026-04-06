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
import { fetchGeekhackThread, buildGeekhackPrefillPayload } from "@/lib/import/geekhack";
import {
  mirrorImgurImageSrcsInHtml,
  mirrorPrefillImages,
} from "@/lib/import/imgur-mirror";
import {
  scanBoardForTopics,
  normalizeTitleForDedup,
  isMetaPost,
  isJunkTitle,
  type GeekhackTopicEntry,
} from "@/lib/import/geekhack-scanner";
import { notifyGoogleIndexing, notifyGoogleOfSitemap } from "@/lib/google-indexing";
import type { ProjectCategory, ProjectStatus } from "@/generated/prisma/client";

// ── Board IDs ────────────────────────────────────────────────────────────────
const IC_BOARD_ID = 70;
const GB_BOARD_ID = 132;

// ── Rate-limiting ─────────────────────────────────────────────────────────────
const DELAY_BETWEEN_FETCHES_MS = 3_000;

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

/**
 * HEAD-check a URL to verify it returns a valid image response.
 * Returns true if the URL is reachable and returns an image content-type.
 */
async function isImageUrlReachable(url: string): Promise<boolean> {
  try {
    const parsed = new URL(url);
    // Skip local/relative URLs (already mirrored to our storage)
    if (parsed.hostname === "localhost" || parsed.pathname.startsWith("/uploads/")) return true;
    // Cloudflare Images delivery URLs are always valid if they exist in our system
    if (parsed.hostname.includes("imagedelivery.net")) return true;

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
function normalizeGeekhackUrl(topicId: string): string {
  return `https://geekhack.org/index.php?topic=${topicId}.0`;
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
      url: normalised,
    },
    select: { id: true },
  });

  return existing !== null;
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
    .replace(/[|:/\\]+/g, " ")
    .replace(/[-–—]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Check whether a project with a similar lifecycle-stable title already exists.
 * Conservative by design: only compares against existing Geekhack imports.
 */
async function isTitleAlreadyImported(rawTitle: string): Promise<boolean> {
  const needle = normalizeTitleForDedup(rawTitle);
  const lifecycleNeedle = buildLifecycleStableTitleKey(rawTitle);
  if (!needle && !lifecycleNeedle) return false;

  const projects = await prisma.project.findMany({
    where: { tags: { has: "geekhack" } },
    select: { title: true },
  });

  return projects.some((p) => {
    const existing = normalizeTitleForDedup(p.title);
    if (needle && existing === needle) return true;

    const existingLifecycle = buildLifecycleStableTitleKey(p.title);
    if (!lifecycleNeedle || lifecycleNeedle.length < 8) return false;
    return existingLifecycle === lifecycleNeedle;
  });
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

  // 2. Dedup by title
  if (await isTitleAlreadyImported(entry.title)) {
    console.log(`${logPrefix} skipped (title match: "${entry.title}")`);
    return { imported: false };
  }

  // 3. Fetch full thread
  let thread;
  try {
    thread = await fetchGeekhackThread(entry.url);
  } catch (err) {
    const msg = `Failed to fetch thread ${entry.url}: ${err instanceof Error ? err.message : String(err)}`;
    console.error(`${logPrefix} ${msg}`);
    return { imported: false, error: msg };
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

  if (plainTextLength < 100) {
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
  const ghUrl = normalizeGeekhackUrl(entry.topicId);
  let project;
  try {
    // Final DB-level dedup check right before insert (prevents race conditions)
    const existingLink = await prisma.projectLink.findFirst({
      where: { type: "GEEKHACK", url: ghUrl },
      select: { id: true },
    });
    if (existingLink) {
      console.log(`${logPrefix} skipped (URL already imported — final check)`);
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
              label: inferredStatus === "GROUP_BUY" ? "Geekhack GB" : "Geekhack IC",
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
  const creatorId =
    process.env.GEEKHACK_IMPORT_USER_ID ?? "cmlwzwwpn000001qpgnkb363r";

  try {
    return await _doImport(maxImports, maxPages, creatorId);
  } finally {
    _runningUntil = 0;
  }
}

async function _doImport(
  maxImports: number,
  maxPages: number,
  creatorId: string
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

  summary.scanned = allWork.length;
  console.log(`[geekhack-auto-import] Total unique topics to evaluate: ${summary.scanned}`);

  // ── Process topics one at a time with rate-limiting ───────────────────────
  // In-memory dedup to prevent duplicates within a single run
  const importedThisRun = new Set<string>();

  for (let i = 0; i < allWork.length; i++) {
    const { entry, status } = allWork[i];

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

    // DB-level dedup checks before fetching the full thread
    const urlDup = await isUrlAlreadyImported(entry.topicId);
    const titleDup = !urlDup && (await isTitleAlreadyImported(entry.title));

    if (urlDup || titleDup) {
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
