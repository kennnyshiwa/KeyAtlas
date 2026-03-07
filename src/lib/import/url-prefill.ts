import { safeFetch } from "@/lib/security/ssrf-guard";
import {
  buildGeekhackPrefillPayload,
  fetchGeekhackThread,
  validateGeekhackTopicUrl,
} from "@/lib/import/geekhack";
import { mirrorImgurImageSrcsInHtml, mirrorPrefillImages } from "@/lib/import/imgur-mirror";
import type { ProjectStatus } from "@/generated/prisma/client";

export interface UrlImportPrefillPayload {
  title: string;
  description: string;
  sourceUrl: string;
  category: "KEYCAPS";
  status: ProjectStatus;
  tags: string[];
  designer?: string | null;
  estimatedDelivery?: string | null;
  gbStartDate?: string | null;
  gbEndDate?: string | null;
  links: Array<{
    label: string;
    url: string;
    type: "GEEKHACK" | "WEBSITE" | "DISCORD" | "INSTAGRAM" | "REDDIT" | "STORE" | "OTHER";
  }>;
  images?: Array<{
    url: string;
    alt?: string;
  }>;
}

function decode(input: string) {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripHtml(input: string) {
  return decode(input.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function pickTitle(html: string, fallbackHost: string) {
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["'][^>]*>/i)?.[1];
  const titleTag = html.match(/<title>([\s\S]*?)<\/title>/i)?.[1];
  return decode((og || titleTag || fallbackHost).replace(/\s+/g, " ").trim());
}

function pickDescription(html: string) {
  const og = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["'][^>]*>/i)?.[1];
  const name = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i)?.[1];
  const article = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)?.[1];
  if (og || name) return `<p>${decode((og || name || "").trim())}</p>`;
  if (article) {
    const text = stripHtml(article).slice(0, 1800);
    return text ? `<p>${text}</p>` : "";
  }
  const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1];
  const fallback = body ? stripHtml(body).slice(0, 1200) : "";
  return fallback ? `<p>${fallback}</p>` : "";
}

function toAbsoluteUrl(url: string, base: string) {
  try {
    return new URL(url, base).toString();
  } catch {
    return null;
  }
}

function pickImages(html: string, baseUrl: string, title: string) {
  const raw = [
    ...html.matchAll(/<meta[^>]+property=["']og:image(?::url)?["'][^>]+content=["']([^"']+)["'][^>]*>/gi),
    ...html.matchAll(/<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["'][^>]*>/gi),
    ...html.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi),
  ].map((m) => m[1]?.trim()).filter((value): value is string => Boolean(value));

  const unique = [...new Set(raw)]
    .map((url) => toAbsoluteUrl(url, baseUrl))
    .filter((url): url is string => Boolean(url))
    .slice(0, 8);

  return unique.map((url, index) => ({
    url,
    alt: `${title} image ${index + 1}`,
  }));
}

export function inferStatus(text: string): ProjectStatus {
  const value = text.toLowerCase();
  if (/\b(group buy|gb live|pre-order|preorder)\b/.test(value)) return "GROUP_BUY";
  if (/\b(in stock|available now|buy now)\b/.test(value)) return "IN_STOCK";
  if (/\b(shipping|shipping now|fulfilled)\b/.test(value)) return "SHIPPING";
  if (/\b(production|manufacturing)\b/.test(value)) return "PRODUCTION";
  if (/\b(extras)\b/.test(value)) return "EXTRAS";
  if (/\b(completed|ended)\b/.test(value)) return "COMPLETED";
  return "INTEREST_CHECK";
}

function inferType(url: string): UrlImportPrefillPayload["links"][number]["type"] {
  const lower = url.toLowerCase();
  if (lower.includes("geekhack.org")) return "GEEKHACK";
  if (lower.includes("discord.")) return "DISCORD";
  if (lower.includes("instagram.")) return "INSTAGRAM";
  if (lower.includes("reddit.")) return "REDDIT";
  if (lower.includes("shop") || lower.includes("store")) return "STORE";
  return "WEBSITE";
}

export function inferDates(text: string) {
  const iso = [...text.matchAll(/\b(20\d{2})[-\/](\d{1,2})[-\/](\d{1,2})\b/g)].map((m) => {
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }).filter((d): d is string => Boolean(d));

  return {
    gbStartDate: iso[0] ?? null,
    gbEndDate: iso[1] ?? null,
  };
}

export async function importUrlPrefill(url: string): Promise<UrlImportPrefillPayload> {
  const geekhackTopic = validateGeekhackTopicUrl(url);
  if (geekhackTopic) {
    const thread = await fetchGeekhackThread(geekhackTopic.normalizedUrl);
    const prefill = buildGeekhackPrefillPayload(thread);
    return {
      ...prefill,
      description: await mirrorImgurImageSrcsInHtml(prefill.description),
      images: await mirrorPrefillImages(prefill.images),
      links: prefill.links,
    };
  }

  const parsed = new URL(url);
  const response = await safeFetch(url, {
    timeoutMs: 15_000,
    headers: {
      "user-agent": "KeyVault URL Importer/1.0",
      accept: "text/html,application/xhtml+xml",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch URL (${response.status})`);
  }

  const html = await response.text();
  const title = pickTitle(html, parsed.hostname);
  const description = pickDescription(html);
  const combinedText = `${title} ${stripHtml(description)} ${stripHtml(html).slice(0, 3000)}`;
  const status = inferStatus(combinedText);
  const dates = inferDates(combinedText);

  const normalizedSource = response.url || url;
  const images = await mirrorPrefillImages(pickImages(html, normalizedSource, title));

  return {
    title,
    description: await mirrorImgurImageSrcsInHtml(description),
    sourceUrl: normalizedSource,
    category: "KEYCAPS",
    status,
    tags: ["imported", parsed.hostname.replace(/^www\./, "")],
    gbStartDate: dates.gbStartDate,
    gbEndDate: dates.gbEndDate,
    links: [
      {
        label: parsed.hostname.replace(/^www\./, ""),
        url: normalizedSource,
        type: inferType(normalizedSource),
      },
    ],
    images,
  };
}
