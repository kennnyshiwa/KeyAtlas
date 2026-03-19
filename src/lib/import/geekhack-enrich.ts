/**
 * Geekhack Project Enrichment
 *
 * Second-pass enrichment for Geekhack-imported projects.
 * Extracts designer, vendors, pricing, dates, and tags from the
 * original thread content and fills in missing project fields.
 */

import type { ExtractedThread } from "./geekhack";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VendorRecord {
  id: string;
  name: string;
  slug: string;
  storefrontUrl: string | null;
}

interface ProjectForEnrichment {
  id: string;
  title: string;
  slug: string;
  status: string;
  description: string | null;
  designer: string | null;
  vendorId: string | null;
  priceMin: number | null;
  priceMax: number | null;
  currency: string;
  icDate: Date | null;
  gbStartDate: Date | null;
  gbEndDate: Date | null;
  tags: string[];
  createdAt: Date;
  projectVendors: { vendorId: string; region: string | null }[];
}

export interface EnrichmentChange {
  field: string;
  oldValue: unknown;
  newValue: unknown;
}

export interface EnrichmentResult {
  projectId: string;
  changed: boolean;
  changes: EnrichmentChange[];
  projectUpdate: Record<string, unknown>;
  vendorsToLink: { vendorId: string; region: string | null; storeLink: string | null }[];
  /** Vendor names found in the structured list that don't exist in the DB yet */
  unknownVendors: { name: string; region: string | null }[];
}

// ---------------------------------------------------------------------------
// Vendor domain → vendor name mapping
// ---------------------------------------------------------------------------

const VENDOR_DOMAIN_MAP: Record<string, string> = {
  "cannonkeys.com": "CannonKeys",
  "novelkeys.com": "NovelKeys",
  "novelkeys.xyz": "NovelKeys",
  "kbdfans.com": "KBDfans",
  "deskhero.ca": "DeskHero",
  "divinikey.com": "Divinikey",
  "omnitype.com": "Omnitype",
  "prototypist.net": "ProtoTypist",
  "keygem.com": "KeyGem",
  "ilumkb.com": "iLumKB",
  "switchkeys.com.au": "Switchkeys",
  "zfrontier.com": "ZFrontier",
  "yushakobo.jp": "Yushakobo",
  "mekibo.com": "Mekibo",
  "keebsupply.com": "KeebSupply",
  "sneakbox.com": "Sneakbox",
  "swagkeys.com": "SwagKeys",
  "oblotzky.industries": "Oblotzky",
  "dailyclack.com": "ClickClack",
  "bowlkeyboards.com": "Bowl Keyboards",
  "torokeebs.com": "Torokeebs",
  "monacokeyboards.com": "MonacoKeys",
  "pantheonkeys.com": "Pantheonkeys",
  "latamkeys.com": "LatamKeys",
  "dashkeebs.com": "Dashkeebs",
  "keycapsule.com": "Keycapsule",
  "koolkeys.co": "KoolKeys",
  "deltakeyco.com": "DeltaKeyCo",
  "carolinamech.com": "Carolina Mech",
  "coffeekeys.com": "CoffeeKeys",
  "unikeys.io": "Unikeys",
  "keebzncables.com": "Keebz N Cables",
  "typistclub.com": "TypistClub",
  "saberkeebs.com": "SaberKeebs",
  "keyreative.com": "Keyreative",
  "rubybuilds.com": "RubyBuilds",
  "pnkeyboard.com": "PNKeyboard",
  "minokeyboards.com": "MinoKeys",
  "whiplashkeys.com": "Whiplash",
  "keybaytech.com": "KeyBayTech",
  "qwertypop.com": "QwertyPop",
  "kiwiclack.com": "Kiwiclack",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stripHtml(text: string): string {
  return text
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// Text cleanup — decode HTML entities and fix mojibake
// ---------------------------------------------------------------------------

/**
 * Decode HTML numeric character references (&#NNN; and &#xHHH;) and named entities.
 */
function decodeHtmlEntities(text: string): string {
  return text
    // Numeric decimal: &#128640; → 🚀
    .replace(/&#(\d+);/g, (_, code) => {
      const n = parseInt(code, 10);
      try { return String.fromCodePoint(n); } catch { return _; }
    })
    // Numeric hex: &#x1F680; → 🚀
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      const n = parseInt(hex, 16);
      try { return String.fromCodePoint(n); } catch { return _; }
    })
    // Common named entities
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&ndash;/g, "–")
    .replace(/&mdash;/g, "—")
    .replace(/&hellip;/g, "…")
    .replace(/&lsquo;/g, "\u2018")
    .replace(/&rsquo;/g, "\u2019")
    .replace(/&ldquo;/g, "\u201C")
    .replace(/&rdquo;/g, "\u201D")
    .replace(/&trade;/g, "™")
    .replace(/&copy;/g, "©")
    .replace(/&reg;/g, "®");
}

/**
 * Fix common mojibake patterns from windows-1252 → UTF-8 misinterpretation.
 */
function fixMojibake(text: string): string {
  return text
    .replace(/â€™/g, "\u2019")  // '
    .replace(/â€˜/g, "\u2018")  // '
    .replace(/â€œ/g, "\u201C")  // "
    .replace(/â€\u009D/g, "\u201D")  // "
    .replace(/â€"/g, "–")       // –
    .replace(/â€"/g, "—")       // —
    .replace(/â€¦/g, "…")       // …
    .replace(/Â /g, " ")
    .replace(/Â/g, "")
    .replace(/Ã©/g, "é")
    .replace(/Ã¨/g, "è")
    .replace(/Ã¼/g, "ü")
    .replace(/Ã¶/g, "ö")
    .replace(/Ã¤/g, "ä")
    .replace(/Ã±/g, "ñ")
    .replace(/Ã³/g, "ó")
    .replace(/Ã¡/g, "á")
    .replace(/Ã­/g, "í");
}

/**
 * Clean up text: decode HTML entities, fix mojibake, normalize whitespace.
 */
function cleanText(text: string): string {
  let cleaned = decodeHtmlEntities(text);
  cleaned = fixMojibake(cleaned);
  // Normalize whitespace (but preserve newlines)
  cleaned = cleaned.replace(/[ \t]+/g, " ");
  return cleaned;
}

/**
 * Check if a string needs cleaning (has HTML entities or mojibake).
 */
function needsCleaning(text: string | null): boolean {
  if (!text) return false;
  return /&#\d+;|&#x[0-9a-f]+;|â€|Ã[©¨¼¶¤±³¡­]/i.test(text);
}

/**
 * Standalone text cleanup for titles and descriptions.
 * Exported for use in the text-cleanup-only mode.
 */
export function cleanProjectText(
  title: string,
  description: string | null
): { changed: boolean; cleanTitle: string; cleanDescription: string | null } {
  const cleanTitle = needsCleaning(title) ? cleanText(title) : title;
  const cleanDescription = description && needsCleaning(description) ? cleanText(description) : description;
  return {
    changed: cleanTitle !== title || cleanDescription !== description,
    cleanTitle,
    cleanDescription,
  };
}

/**
 * Build a case-insensitive name → VendorRecord lookup, plus domain → VendorRecord.
 */
export function buildVendorLookups(vendors: VendorRecord[]) {
  const byNameLower = new Map<string, VendorRecord>();
  const byDomain = new Map<string, VendorRecord>();

  for (const v of vendors) {
    byNameLower.set(v.name.toLowerCase(), v);
  }

  // Map known domains to vendor records
  for (const [domain, vendorName] of Object.entries(VENDOR_DOMAIN_MAP)) {
    const vendor = byNameLower.get(vendorName.toLowerCase());
    if (vendor) {
      byDomain.set(domain, vendor);
    }
  }

  // Also extract domains from vendor storefrontUrls
  for (const v of vendors) {
    if (v.storefrontUrl) {
      try {
        const host = new URL(v.storefrontUrl).hostname.replace(/^www\./, "");
        if (!byDomain.has(host)) {
          byDomain.set(host, v);
        }
      } catch {
        // skip invalid URLs
      }
    }
  }

  return { byNameLower, byDomain };
}

// ---------------------------------------------------------------------------
// Designer extraction
// ---------------------------------------------------------------------------

function extractDesigner(
  project: ProjectForEnrichment,
  thread: ExtractedThread
): EnrichmentChange | null {
  if (project.designer) return null;
  if (!thread.op?.author) return null;

  const designer = stripHtml(thread.op.author).trim();
  if (!designer) return null;

  return { field: "designer", oldValue: null, newValue: designer };
}

// ---------------------------------------------------------------------------
// Vendor matching
// ---------------------------------------------------------------------------

interface VendorMatch {
  vendor: VendorRecord;
  storeLink: string | null;
  region: string | null;
}

const REGION_PATTERNS: Record<string, RegExp> = {
  US: /\bUS\b|\bUSA\b|\bNorth\s+America\b|\bNA\b|\bRest\s+of\s+(?:the\s+)?world\b|\bROW\b/i,
  EU: /\bEU\b|\bEurope\b/i,
  UK: /\bUK\b|\bUnited\s+Kingdom\b/i,
  OCE: /\bOCE\b|\bOceania\b|\bAustralia\b|\bAU\b/i,
  CA: /\bCA\b|\bCanada\b/i,
  SEA: /\bSEA\b|\bSouth(?:east|[\s-]*East)\s+Asia\b/i,
  Asia: /\bAsia\b(?!.*(?:South(?:east|[\s-]*East)))/i,
  KR: /\bKR\b|\bKorea\b|\bSouth\s+Korea\b/i,
  JP: /\bJP\b|\bJapan\b/i,
  CN: /\bCN\b|\bChina\b/i,
  LATAM: /\bLATAM\b|\bLatin\s+America\b/i,
  VN: /\bVN\b|\bVietnam\b/i,
};

function detectRegionNearVendor(text: string, vendorPos: number): string | null {
  // Look at ~100 chars around the vendor mention for a region hint
  const window = text.substring(
    Math.max(0, vendorPos - 20),
    Math.min(text.length, vendorPos + 120)
  );
  for (const [region, pattern] of Object.entries(REGION_PATTERNS)) {
    if (pattern.test(window)) return region;
  }
  return null;
}

function extractUrlsFromText(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s<>"')\]]+/gi;
  return [...text.matchAll(urlRegex)].map((m) => m[0]);
}

/**
 * Parse structured vendor lists commonly found in Geekhack posts.
 * Format: "- Region: VendorName" or "Region — VendorName" per line.
 * 
 * Only parses lines that appear near a "Vendors:" header AND where
 * the left side matches a known region pattern. This prevents false
 * positives from other "Label: Value" patterns in the post.
 */
function parseStructuredVendorList(text: string): Array<{ vendorName: string; region: string | null }> {
  const results: Array<{ vendorName: string; region: string | null }> = [];

  // Find the "Vendors:" section in the text
  const vendorSectionMatch = text.match(/\bVendors?\s*[:：]\s*\n/i);
  if (!vendorSectionMatch || vendorSectionMatch.index === undefined) return results;

  // Extract ~2000 chars after the "Vendors:" header
  const sectionStart = vendorSectionMatch.index + vendorSectionMatch[0].length;
  const section = text.slice(sectionStart, sectionStart + 2000);

  // Match lines like "- Region: VendorName"
  const linePattern = /^[-–—•*]?\s*(.+?)\s*[:：]\s*(.+?)$/gm;

  for (const m of section.matchAll(linePattern)) {
    const regionText = m[1].trim();
    const vendorName = m[2].trim();

    // Skip obvious non-vendor lines
    if (vendorName.length > 40 || vendorName.includes("http") || regionText.length > 50) continue;

    // REQUIRE the left side to match a known region — this is the key filter
    let region: string | null = null;
    for (const [regionCode, pattern] of Object.entries(REGION_PATTERNS)) {
      if (pattern.test(regionText)) {
        region = regionCode;
        break;
      }
    }

    // Only include if region was detected
    if (region) {
      results.push({ vendorName, region });
    }
  }

  // Stop parsing after hitting a blank line or a new section header
  return results;
}

/**
 * Fuzzy vendor name matching — handles spaces, dots, capitalization differences.
 * "Click Clack" → "ClickClack", "iLumKB" → "ilumkb", etc.
 */
function normalizeVendorName(name: string): string {
  return name.toLowerCase().replace(/[\s.\-_]+/g, "");
}

function findVendorMatches(
  text: string,
  urls: string[],
  lookups: ReturnType<typeof buildVendorLookups>
): VendorMatch[] {
  const seen = new Set<string>();
  const matches: VendorMatch[] = [];

  // Build normalized name lookup for fuzzy matching
  const byNormalized = new Map<string, VendorRecord>();
  for (const [, vendor] of lookups.byNameLower) {
    byNormalized.set(normalizeVendorName(vendor.name), vendor);
  }

  // 1) Parse structured vendor list (highest priority — has region info)
  const structuredVendors = parseStructuredVendorList(text);
  for (const { vendorName, region } of structuredVendors) {
    // Try exact match first, then normalized
    const vendor =
      lookups.byNameLower.get(vendorName.toLowerCase()) ??
      byNormalized.get(normalizeVendorName(vendorName));

    if (vendor && !seen.has(vendor.id)) {
      seen.add(vendor.id);
      const storeLink = findStoreLinkForVendor(urls, vendor, lookups.byDomain) ?? null;
      matches.push({ vendor, storeLink, region });
    }
  }

  // 2) Match vendor names in text (case-insensitive, word-boundary)
  const textLower = text.toLowerCase();
  for (const [nameLower, vendor] of lookups.byNameLower) {
    if (seen.has(vendor.id)) continue;

    const escaped = nameLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern =
      nameLower.length >= 3
        ? new RegExp(`\\b${escaped}\\b`, "i")
        : new RegExp(`(?:^|\\s)${escaped}(?:\\s|$)`, "i");

    const match = pattern.exec(textLower);
    if (match) {
      seen.add(vendor.id);
      const region = detectRegionNearVendor(text, match.index);
      const storeLink = findStoreLinkForVendor(urls, vendor, lookups.byDomain) ?? null;
      matches.push({ vendor, storeLink, region });
    }
  }

  // 3) Match vendor domains in URLs
  for (const url of urls) {
    try {
      const host = new URL(url).hostname.replace(/^www\./, "");
      const vendor = lookups.byDomain.get(host);
      if (vendor && !seen.has(vendor.id)) {
        seen.add(vendor.id);
        matches.push({ vendor, storeLink: url, region: null });
      }
    } catch {
      // skip invalid URLs
    }
  }

  // 4) "available at", "sold by" patterns
  const vendorContextPatterns = [
    /(?:available\s+(?:at|from|through)|sold\s+(?:by|at|through)|order\s+(?:at|from|through))\s+(\S[\w\s&']+?)(?:\s*[\(\.,;:\n]|$)/gi,
  ];
  for (const pattern of vendorContextPatterns) {
    for (const m of text.matchAll(pattern)) {
      const candidateName = m[1]?.trim();
      if (!candidateName) continue;
      const vendor =
        lookups.byNameLower.get(candidateName.toLowerCase()) ??
        byNormalized.get(normalizeVendorName(candidateName));
      if (vendor && !seen.has(vendor.id)) {
        seen.add(vendor.id);
        const storeLink = findStoreLinkForVendor(urls, vendor, lookups.byDomain) ?? null;
        matches.push({ vendor, storeLink, region: null });
      }
    }
  }

  return matches;
}

function findStoreLinkForVendor(
  urls: string[],
  vendor: VendorRecord,
  byDomain: Map<string, VendorRecord>
): string | undefined {
  return urls.find((url) => {
    try {
      const host = new URL(url).hostname.replace(/^www\./, "");
      const matched = byDomain.get(host);
      return matched?.id === vendor.id;
    } catch {
      return false;
    }
  });
}

// ---------------------------------------------------------------------------
// Pricing extraction
// ---------------------------------------------------------------------------

interface PricingResult {
  priceMin: number;
  priceMax: number | null;
  currency: string;
}

function extractPricing(
  project: ProjectForEnrichment,
  text: string
): EnrichmentChange[] {
  if (project.priceMin !== null) return [];

  const changes: EnrichmentChange[] = [];

  // Try base kit price first (most relevant for keycaps)
  const baseKitPattern = /(?:base\s*(?:kit)?|alphas?\s*(?:kit)?)\s*[:=]?\s*\$\s*([\d,]+(?:\.\d{1,2})?)/i;
  const baseMatch = text.match(baseKitPattern);

  // General price patterns
  const rangePattern = /(?:^|\s)(\$|€|£)\s*([\d,]+(?:\.\d{1,2})?)\s*[-–—]\s*\1?\s*([\d,]+(?:\.\d{1,2})?)/m;
  const singlePattern = /(?:^|\s)(\$|€|£)\s*([\d,]+(?:\.\d{1,2})?)/m;

  let pricing: PricingResult | null = null;

  if (baseMatch) {
    const amount = parseFloat(baseMatch[1].replace(/,/g, ""));
    if (amount > 0 && amount < 10000) {
      pricing = { priceMin: Math.round(amount * 100), priceMax: null, currency: "USD" };
    }
  }

  if (!pricing) {
    const rangeMatch = text.match(rangePattern);
    if (rangeMatch) {
      const currency = currencyFromSymbol(rangeMatch[1]);
      const min = parseFloat(rangeMatch[2].replace(/,/g, ""));
      const max = parseFloat(rangeMatch[3].replace(/,/g, ""));
      if (min > 0 && min < 10000 && max > min && max < 10000) {
        pricing = {
          priceMin: Math.round(min * 100),
          priceMax: Math.round(max * 100),
          currency,
        };
      }
    }
  }

  if (!pricing) {
    const singleMatch = text.match(singlePattern);
    if (singleMatch) {
      const currency = currencyFromSymbol(singleMatch[1]);
      const amount = parseFloat(singleMatch[2].replace(/,/g, ""));
      if (amount > 0 && amount < 10000) {
        pricing = { priceMin: Math.round(amount * 100), priceMax: null, currency };
      }
    }
  }

  if (pricing) {
    changes.push({ field: "priceMin", oldValue: null, newValue: pricing.priceMin });
    if (pricing.priceMax) {
      changes.push({ field: "priceMax", oldValue: null, newValue: pricing.priceMax });
    }
    if (pricing.currency !== project.currency) {
      changes.push({ field: "currency", oldValue: project.currency, newValue: pricing.currency });
    }
  }

  return changes;
}

function currencyFromSymbol(symbol: string): string {
  switch (symbol) {
    case "€":
      return "EUR";
    case "£":
      return "GBP";
    default:
      return "USD";
  }
}

// ---------------------------------------------------------------------------
// Date extraction
// ---------------------------------------------------------------------------

const MONTH_MAP: Record<string, number> = {
  january: 0, jan: 0,
  february: 1, feb: 1,
  march: 2, mar: 2,
  april: 3, apr: 3,
  may: 4,
  june: 5, jun: 5,
  july: 6, jul: 6,
  august: 7, aug: 7,
  september: 8, sep: 8, sept: 8,
  october: 9, oct: 9,
  november: 10, nov: 10,
  december: 11, dec: 11,
};

/**
 * Parse a natural date string. If no year is found, uses `inferYear` as fallback.
 */
function parseNaturalDate(str: string, inferYear?: number): Date | null {
  // Strip ordinal suffixes (1st, 2nd, 3rd, 4th, 10th, etc.) and commas
  const cleaned = str.trim().replace(/(\d+)(?:st|nd|rd|th)\b/gi, "$1").replace(/,/g, "");

  // "March 1 2024" or "March 1, 2024" or "10th June 2025"
  const mdy = cleaned.match(/(\w+)\s+(\d{1,2})\s+(\d{4})/);
  if (mdy) {
    const month = MONTH_MAP[mdy[1].toLowerCase()];
    if (month !== undefined) {
      const d = new Date(parseInt(mdy[3]), month, parseInt(mdy[2]));
      if (!isNaN(d.getTime())) return d;
    }
  }

  // "1 March 2024" or "10 June 2025"
  const dmy = cleaned.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
  if (dmy) {
    const month = MONTH_MAP[dmy[2].toLowerCase()];
    if (month !== undefined) {
      const d = new Date(parseInt(dmy[3]), month, parseInt(dmy[1]));
      if (!isNaN(d.getTime())) return d;
    }
  }

  // "2024-03-01" ISO-ish
  const iso = cleaned.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const d = new Date(parseInt(iso[1]), parseInt(iso[2]) - 1, parseInt(iso[3]));
    if (!isNaN(d.getTime())) return d;
  }

  // "MM/DD/YYYY"
  const slashed = cleaned.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (slashed) {
    const d = new Date(parseInt(slashed[3]), parseInt(slashed[1]) - 1, parseInt(slashed[2]));
    if (!isNaN(d.getTime())) return d;
  }

  // --- No year found — try "Month Day" or "Day Month" with inferred year ---
  if (inferYear) {
    // "March 20" or "MARCH 20"
    const monthDay = cleaned.match(/(\w+)\s+(\d{1,2})(?:\s|$)/);
    if (monthDay) {
      const month = MONTH_MAP[monthDay[1].toLowerCase()];
      if (month !== undefined) {
        const d = new Date(inferYear, month, parseInt(monthDay[2]));
        if (!isNaN(d.getTime())) return d;
      }
    }

    // "20 March"
    const dayMonth = cleaned.match(/(\d{1,2})\s+(\w+)(?:\s|$)/);
    if (dayMonth) {
      const month = MONTH_MAP[dayMonth[2].toLowerCase()];
      if (month !== undefined) {
        const d = new Date(inferYear, month, parseInt(dayMonth[1]));
        if (!isNaN(d.getTime())) return d;
      }
    }
  }

  return null;
}

function extractDates(
  project: ProjectForEnrichment,
  text: string
): EnrichmentChange[] {
  const changes: EnrichmentChange[] = [];

  // Use project creation year as fallback for dates without year
  const inferYear = project.createdAt.getFullYear();

  // GB date range patterns — check body text first, then title
  if (!project.gbStartDate || !project.gbEndDate) {
    const gbRangePatterns = [
      // "Time：10th June 2025 - 10th July 2025" (fullwidth or normal colon)
      /(?:Time|Date)\s*[：:=]\s*(.+?)\s*[-–—]\s*(.+?)(?:\n|$)/i,
      /(?:GB|Group\s*Buy|Group\s*buy)\s*(?:Date)?\s*[：:=]?\s*(.+?)\s*[-–—]\s*(.+?)(?:\n|$|\.)/i,
      /(?:Group\s*buy\s*(?:runs|starts|begins)\s*(?:from)?)\s*(.+?)\s*(?:to|through|until|-|–|—)\s*(.+?)(?:\n|$|\.)/i,
    ];

    // Also try to extract dates from parenthetical in title
    // e.g., "DCS Hangul PBT | GB SOON! (MARCH 20 - APRIL 3)"
    const titleDatePattern = /\(([A-Z][a-zA-Z]+\s+\d{1,2})\s*[-–—]\s*([A-Z][a-zA-Z]+\s+\d{1,2})\)/;
    // Also: "(March 20 - April 3, 2026)" with year
    const titleDatePatternWithYear = /\(([A-Z][a-zA-Z]+\s+\d{1,2})\s*[-–—]\s*([A-Z][a-zA-Z]+\s+\d{1,2},?\s*\d{4})\)/;

    // Try body text patterns first
    let found = false;
    for (const pattern of gbRangePatterns) {
      const match = text.match(pattern);
      if (match) {
        const start = parseNaturalDate(match[1], inferYear);
        const end = parseNaturalDate(match[2], inferYear);
        if (start && !project.gbStartDate) {
          changes.push({ field: "gbStartDate", oldValue: null, newValue: start });
          found = true;
        }
        if (end && !project.gbEndDate) {
          changes.push({ field: "gbEndDate", oldValue: null, newValue: end });
          found = true;
        }
        if (found) break;
      }
    }

    // If not found in body, try title
    if (!found) {
      const titleMatch =
        project.title.match(titleDatePatternWithYear) ??
        project.title.match(titleDatePattern);

      if (titleMatch) {
        const start = parseNaturalDate(titleMatch[1], inferYear);
        const end = parseNaturalDate(titleMatch[2], inferYear);
        if (start && !project.gbStartDate) {
          changes.push({ field: "gbStartDate", oldValue: null, newValue: start });
        }
        if (end && !project.gbEndDate) {
          changes.push({ field: "gbEndDate", oldValue: null, newValue: end });
        }
      }
    }

    // Also try generic date ranges in body: "Month Day - Month Day, Year"
    if (changes.length === 0 && (!project.gbStartDate || !project.gbEndDate)) {
      const genericRange = text.match(
        /(\w+\s+\d{1,2}(?:st|nd|rd|th)?)\s*[-–—]\s*(\w+\s+\d{1,2}(?:st|nd|rd|th)?,?\s*\d{4})/i
      );
      if (genericRange) {
        const start = parseNaturalDate(genericRange[1], inferYear);
        const end = parseNaturalDate(genericRange[2], inferYear);
        if (start && !project.gbStartDate) {
          changes.push({ field: "gbStartDate", oldValue: null, newValue: start });
        }
        if (end && !project.gbEndDate) {
          changes.push({ field: "gbEndDate", oldValue: null, newValue: end });
        }
      }
    }
  }

  // IC date
  if (!project.icDate) {
    const icPatterns = [
      /(?:IC\s*(?:posted|date|started)\s*[:=]?)\s*(.+?)(?:\n|$|\.)/i,
      /(?:Interest\s*Check\s*[:=]?)\s*(.+?)(?:\n|$|\.)/i,
    ];

    for (const pattern of icPatterns) {
      const match = text.match(pattern);
      if (match) {
        const date = parseNaturalDate(match[1], inferYear);
        if (date) {
          changes.push({ field: "icDate", oldValue: null, newValue: date });
          break;
        }
      }
    }
  }

  return changes;
}

// ---------------------------------------------------------------------------
// Tag enrichment
// ---------------------------------------------------------------------------

interface TagConfig {
  tag: string;
  pattern: RegExp;
}

const PROFILE_TAGS: TagConfig[] = [
  { tag: "cherry-profile", pattern: /\bcherry\s*(?:profile)?\b/i },
  { tag: "sa-profile", pattern: /\bSA\s*(?:profile)?\b/ },
  { tag: "dsa-profile", pattern: /\bDSA\s*(?:profile)?\b/ },
  { tag: "kat-profile", pattern: /\bKAT\s*(?:profile)?\b/ },
  { tag: "mt3-profile", pattern: /\bMT3\s*(?:profile)?\b/ },
  { tag: "xda-profile", pattern: /\bXDA\s*(?:profile)?\b/ },
  { tag: "oem-profile", pattern: /\bOEM\s*(?:profile)?\b/ },
  { tag: "dcs-profile", pattern: /\bDCS\s*(?:profile)?\b/ },
  { tag: "mda-profile", pattern: /\bMDA\s*(?:profile)?\b/ },
  { tag: "asa-profile", pattern: /\bASA\s*(?:profile)?\b/ },
];

const MATERIAL_TAGS: TagConfig[] = [
  { tag: "pbt", pattern: /\bPBT\b/ },
  { tag: "abs", pattern: /\bABS\b/ },
  { tag: "pom", pattern: /\bPOM\b/ },
  { tag: "polycarbonate", pattern: /\bpolycarbonate\b/i },
];

const MANUFACTURING_TAGS: TagConfig[] = [
  { tag: "doubleshot", pattern: /\bdouble[\s-]?shot\b/i },
  { tag: "dye-sub", pattern: /\bdye[\s-]?sub(?:limation)?\b/i },
  { tag: "reverse-dye-sub", pattern: /\breverse[\s-]?dye[\s-]?sub\b/i },
  { tag: "pad-printed", pattern: /\bpad[\s-]?print(?:ed)?\b/i },
  { tag: "laser-etched", pattern: /\blaser[\s-]?etch(?:ed)?\b/i },
];

const MANUFACTURER_TAGS: TagConfig[] = [
  { tag: "gmk", pattern: /\bGMK\b/ },
  { tag: "sp", pattern: /\bSignature\s+Plastics\b/i },
  { tag: "epbt", pattern: /\bePBT\b/i },
  { tag: "jtk", pattern: /\bJTK\b/ },
  { tag: "keyreative", pattern: /\bKeyreative\b/i },
  { tag: "milkyway", pattern: /\bMilkyway\b/i },
  { tag: "dmk", pattern: /\bDMK\b/ },
];

function extractTags(text: string, existingTags: string[]): { add: string[]; remove: string[] } {
  const existing = new Set(existingTags.map((t) => t.toLowerCase()));
  const toAdd: string[] = [];
  const toRemove: string[] = [];

  const allTagConfigs = [
    ...PROFILE_TAGS,
    ...MATERIAL_TAGS,
    ...MANUFACTURING_TAGS,
    ...MANUFACTURER_TAGS,
  ];

  for (const { tag, pattern } of allTagConfigs) {
    if (!existing.has(tag) && pattern.test(text)) {
      toAdd.push(tag);
    }
  }

  // Remove "auto-imported", add "enriched"
  if (existing.has("auto-imported")) {
    toRemove.push("auto-imported");
  }
  if (!existing.has("enriched")) {
    toAdd.push("enriched");
  }

  return { add: toAdd, remove: toRemove };
}

// ---------------------------------------------------------------------------
// Main enrichment function
// ---------------------------------------------------------------------------
// Status inference
// ---------------------------------------------------------------------------

/**
 * Infer the correct project status from the title, body text, and dates.
 * Returns a change only if the inferred status differs from the current one
 * AND the inference is confident.
 */
function inferStatus(
  project: ProjectForEnrichment,
  title: string,
  text: string
): EnrichmentChange | null {
  const t = title.trim();
  const combined = `${t} ${text.slice(0, 500)}`;

  let inferred: string | null = null;

  // Strong title-based signals
  if (/^\s*\[GB\]/i.test(t) || /\bGB\s+(?:Now\s+)?Live\b/i.test(t) || /^\s*\[Group\s+Buy\]/i.test(t) || /\bGroup\s+Buy\b.*\b(?:live|open|running|now)\b/i.test(t)) {
    inferred = "GROUP_BUY";
  } else if (/\bGB\s+Closed\b/i.test(t) || /\bGroup\s+Buy\s+(?:Closed|Ended|Over)\b/i.test(t) || /\bClosed\b/i.test(t) && /\bGB\b/i.test(t)) {
    inferred = "COMPLETED";
  } else if (/\b(?:In[\s-]?Stock|Instock)\b/i.test(t)) {
    inferred = "IN_STOCK";
  } else if (/\bExtras?\b/i.test(t)) {
    inferred = "EXTRAS";
  } else if (/\b(?:Pre[\s-]?order|Preorder)\b/i.test(t)) {
    inferred = "GROUP_BUY";
  } else if (/\bShipping\b/i.test(t) || /\b(?:currently|now)\s+shipping\b/i.test(combined)) {
    inferred = "SHIPPING";
  } else if (/^\s*\[IC\]/i.test(t) || /^\s*\[Interest\s+Check\]/i.test(t)) {
    inferred = "INTEREST_CHECK";
  }

  // Date-based inference (only if title didn't give a strong signal)
  if (!inferred) {
    const now = new Date();

    // Check newly extracted dates too (they may be in projectUpdate)
    const gbEnd = project.gbEndDate;
    const gbStart = project.gbStartDate;

    // If GB end date is in the past and status is GROUP_BUY → completed
    if (gbEnd && gbEnd < now && project.status === "GROUP_BUY") {
      inferred = "COMPLETED";
    }
    // If GB start is in the future and status is GROUP_BUY → still IC
    else if (gbStart && gbStart > now && project.status === "GROUP_BUY") {
      inferred = "INTEREST_CHECK";
    }
    // If GB start is in past and end is in future → should be GROUP_BUY
    else if (gbStart && gbStart <= now && gbEnd && gbEnd >= now && project.status === "INTEREST_CHECK") {
      inferred = "GROUP_BUY";
    }
  }

  if (!inferred || inferred === project.status) return null;

  return { field: "status", oldValue: project.status, newValue: inferred };
}

// ---------------------------------------------------------------------------

export function enrichProject(
  project: ProjectForEnrichment,
  thread: ExtractedThread,
  vendorLookups: ReturnType<typeof buildVendorLookups>
): EnrichmentResult {
  const changes: EnrichmentChange[] = [];
  const projectUpdate: Record<string, unknown> = {};
  const vendorsToLink: EnrichmentResult["vendorsToLink"] = [];

  const text = thread.op?.contentText ?? "";
  const urls = [
    ...extractUrlsFromText(text),
    ...(thread.op?.links ?? []),
  ];

  // 0. Text cleanup — decode HTML entities and fix mojibake in title and description
  if (needsCleaning(project.title)) {
    const cleanedTitle = cleanText(project.title);
    if (cleanedTitle !== project.title) {
      changes.push({ field: "title", oldValue: project.title, newValue: cleanedTitle });
      projectUpdate.title = cleanedTitle;
    }
  }
  if (needsCleaning(project.description)) {
    const cleanedDesc = cleanText(project.description!);
    if (cleanedDesc !== project.description) {
      changes.push({ field: "description", oldValue: "(cleaned)", newValue: "(cleaned)" });
      projectUpdate.description = cleanedDesc;
    }
  }

  // 1. Designer
  const designerChange = extractDesigner(project, thread);
  if (designerChange) {
    changes.push(designerChange);
    projectUpdate.designer = designerChange.newValue;
  }

  // 2. Vendors
  const vendorMatches = findVendorMatches(text, urls, vendorLookups);
  const existingVendorIds = new Set(project.projectVendors.map((pv) => pv.vendorId));

  // Track vendors from structured list that weren't found in DB
  const unknownVendors: EnrichmentResult["unknownVendors"] = [];
  const structuredList = parseStructuredVendorList(text);
  const byNormalized = new Map<string, VendorRecord>();
  for (const [, vendor] of vendorLookups.byNameLower) {
    byNormalized.set(normalizeVendorName(vendor.name), vendor);
  }
  for (const { vendorName, region } of structuredList) {
    const found =
      vendorLookups.byNameLower.get(vendorName.toLowerCase()) ??
      byNormalized.get(normalizeVendorName(vendorName));
    if (!found) {
      unknownVendors.push({ name: vendorName, region });
    }
  }

  if (vendorMatches.length > 0) {
    // Set primary vendor if not already set
    if (!project.vendorId) {
      projectUpdate.vendorId = vendorMatches[0].vendor.id;
      changes.push({
        field: "vendorId",
        oldValue: null,
        newValue: vendorMatches[0].vendor.name,
      });
    }

    // Create ProjectVendor entries for all matches not already linked
    for (const match of vendorMatches) {
      if (!existingVendorIds.has(match.vendor.id)) {
        vendorsToLink.push({
          vendorId: match.vendor.id,
          region: match.region,
          storeLink: match.storeLink,
        });
      }
    }

    if (vendorsToLink.length > 0) {
      changes.push({
        field: "projectVendors",
        oldValue: existingVendorIds.size,
        newValue: existingVendorIds.size + vendorsToLink.length,
      });
    }
  }

  // 3. Pricing
  const pricingChanges = extractPricing(project, text);
  for (const change of pricingChanges) {
    changes.push(change);
    projectUpdate[change.field] = change.newValue;
  }

  // 4. Dates
  const dateChanges = extractDates(project, text);
  for (const change of dateChanges) {
    changes.push(change);
    projectUpdate[change.field] = change.newValue;
  }

  // 5. Status inference
  const statusChange = inferStatus(project, project.title, text);
  if (statusChange) {
    changes.push(statusChange);
    projectUpdate.status = statusChange.newValue;
  }

  // 6. Tags
  const tagResult = extractTags(text, project.tags);
  if (tagResult.add.length > 0 || tagResult.remove.length > 0) {
    const newTags = [
      ...project.tags.filter((t) => !tagResult.remove.includes(t.toLowerCase())),
      ...tagResult.add,
    ];
    projectUpdate.tags = newTags;
    changes.push({
      field: "tags",
      oldValue: project.tags,
      newValue: newTags,
    });
  }

  return {
    projectId: project.id,
    changed: changes.length > 0 || unknownVendors.length > 0,
    changes,
    projectUpdate,
    vendorsToLink,
    unknownVendors,
  };
}
