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
  designer: string | null;
  vendorId: string | null;
  priceMin: number | null;
  priceMax: number | null;
  currency: string;
  icDate: Date | null;
  gbStartDate: Date | null;
  gbEndDate: Date | null;
  tags: string[];
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
  US: /\(US\)|\bUS\b|\bUSA\b|\bNorth\s+America\b|\bNA\b/i,
  EU: /\(EU\)|\bEU\b|\bEurope\b/i,
  Asia: /\(Asia\)|\bAsia\b|\bSEA\b|\bASIA\b/i,
  OCE: /\(OCE\)|\bOCE\b|\bAustralia\b|\bAU\b/i,
  CA: /\(CA\)|\bCanada\b/i,
  UK: /\(UK\)|\bUK\b/i,
  LATAM: /\(LATAM\)|\bLATAM\b|\bLatin\s+America\b/i,
  JP: /\(JP\)|\bJapan\b/i,
  CN: /\(CN\)|\bChina\b/i,
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

function findVendorMatches(
  text: string,
  urls: string[],
  lookups: ReturnType<typeof buildVendorLookups>
): VendorMatch[] {
  const seen = new Set<string>();
  const matches: VendorMatch[] = [];

  const textLower = text.toLowerCase();

  // 1) Match vendor names in text (case-insensitive, word-boundary)
  for (const [nameLower, vendor] of lookups.byNameLower) {
    // Use word boundary for names >= 3 chars; exact match for shorter
    const escaped = nameLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern =
      nameLower.length >= 3
        ? new RegExp(`\\b${escaped}\\b`, "i")
        : new RegExp(`(?:^|\\s)${escaped}(?:\\s|$)`, "i");

    const match = pattern.exec(textLower);
    if (match && !seen.has(vendor.id)) {
      seen.add(vendor.id);
      const region = detectRegionNearVendor(text, match.index);
      // Look for a URL from that vendor nearby
      const storeLink = findStoreLinkForVendor(urls, vendor, lookups.byDomain) ?? null;
      matches.push({ vendor, storeLink, region });
    }
  }

  // 2) Match vendor domains in URLs
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

  // 3) Also look for "available at", "sold by" patterns
  const vendorContextPatterns = [
    /(?:available\s+(?:at|from|through)|sold\s+(?:by|at|through)|order\s+(?:at|from|through))\s+(\S[\w\s&']+?)(?:\s*[\(\.,;:\n]|$)/gi,
  ];
  for (const pattern of vendorContextPatterns) {
    for (const m of text.matchAll(pattern)) {
      const candidateName = m[1]?.trim().toLowerCase();
      if (candidateName) {
        const vendor = lookups.byNameLower.get(candidateName);
        if (vendor && !seen.has(vendor.id)) {
          seen.add(vendor.id);
          const storeLink = findStoreLinkForVendor(urls, vendor, lookups.byDomain) ?? null;
          matches.push({ vendor, storeLink, region: null });
        }
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

function parseNaturalDate(str: string): Date | null {
  const cleaned = str.trim().replace(/,/g, "");

  // "March 1 2024" or "1 March 2024" or "March 1, 2024"
  const mdy = cleaned.match(/(\w+)\s+(\d{1,2})\s+(\d{4})/);
  if (mdy) {
    const month = MONTH_MAP[mdy[1].toLowerCase()];
    if (month !== undefined) {
      const d = new Date(parseInt(mdy[3]), month, parseInt(mdy[2]));
      if (!isNaN(d.getTime())) return d;
    }
  }

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

  return null;
}

function extractDates(
  project: ProjectForEnrichment,
  text: string
): EnrichmentChange[] {
  const changes: EnrichmentChange[] = [];

  // GB date range patterns
  if (!project.gbStartDate || !project.gbEndDate) {
    const gbRangePatterns = [
      /(?:GB|Group\s*Buy|Group\s*buy)\s*[:=]?\s*(.+?)\s*[-–—]\s*(.+?)(?:\n|$|\.)/i,
      /(?:Group\s*buy\s*(?:runs|starts|begins)\s*(?:from)?)\s*(.+?)\s*(?:to|through|until|-|–|—)\s*(.+?)(?:\n|$|\.)/i,
    ];

    for (const pattern of gbRangePatterns) {
      const match = text.match(pattern);
      if (match) {
        const start = parseNaturalDate(match[1]);
        const end = parseNaturalDate(match[2]);
        if (start && !project.gbStartDate) {
          changes.push({ field: "gbStartDate", oldValue: null, newValue: start });
        }
        if (end && !project.gbEndDate) {
          changes.push({ field: "gbEndDate", oldValue: null, newValue: end });
        }
        if (changes.length > 0) break;
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
        const date = parseNaturalDate(match[1]);
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

  // 1. Designer
  const designerChange = extractDesigner(project, thread);
  if (designerChange) {
    changes.push(designerChange);
    projectUpdate.designer = designerChange.newValue;
  }

  // 2. Vendors
  const vendorMatches = findVendorMatches(text, urls, vendorLookups);
  const existingVendorIds = new Set(project.projectVendors.map((pv) => pv.vendorId));

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

  // 5. Tags
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
    changed: changes.length > 0,
    changes,
    projectUpdate,
    vendorsToLink,
  };
}
