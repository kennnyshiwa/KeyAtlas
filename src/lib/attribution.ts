export interface AttributionContext {
  ref?: string;
  utmSource?: string;
  utmCampaign?: string;
  capturedAt?: string;
}

const ATTRIBUTION_COOKIE = "ka_attribution";
const ATTRIBUTION_STORAGE_KEY = "ka_attribution";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

function safeDecode(value: string): AttributionContext | null {
  try {
    return JSON.parse(decodeURIComponent(value)) as AttributionContext;
  } catch {
    return null;
  }
}

function safeEncode(value: AttributionContext): string {
  return encodeURIComponent(JSON.stringify(value));
}

function getCookieValue(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${name}=`));

  return match ? match.slice(name.length + 1) : null;
}

export function readAttributionContext(): AttributionContext | null {
  if (typeof window === "undefined") return null;

  const cookieRaw = getCookieValue(ATTRIBUTION_COOKIE);
  if (cookieRaw) {
    const fromCookie = safeDecode(cookieRaw);
    if (fromCookie) return fromCookie;
  }

  try {
    const raw = window.localStorage.getItem(ATTRIBUTION_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AttributionContext;
  } catch {
    return null;
  }
}

export function captureAttributionFromUrl(search: URLSearchParams): AttributionContext | null {
  if (typeof window === "undefined") return null;

  const existing = readAttributionContext();
  if (existing) return existing;

  const ref = search.get("ref")?.trim();
  const utmSource = search.get("utm_source")?.trim();
  const utmCampaign = search.get("utm_campaign")?.trim();

  if (!ref && !utmSource && !utmCampaign) return null;

  const next: AttributionContext = {
    ref: ref || undefined,
    utmSource: utmSource || undefined,
    utmCampaign: utmCampaign || undefined,
    capturedAt: new Date().toISOString(),
  };

  try {
    const encoded = safeEncode(next);
    document.cookie = `${ATTRIBUTION_COOKIE}=${encoded}; path=/; max-age=${MAX_AGE_SECONDS}; samesite=lax`;
  } catch {
    // no-op, we'll still try localStorage fallback
  }

  try {
    window.localStorage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // no-op
  }

  return next;
}
