/**
 * google-indexing.ts
 *
 * Non-fatal Google Indexing API + Search Console sitemap resubmit integration.
 * Uses Node built-in crypto — no external dependencies.
 *
 * Requires env var GOOGLE_SERVICE_ACCOUNT_JSON (full JSON string of the
 * service account credentials).
 */

import crypto from "crypto";

// ── Types ────────────────────────────────────────────────────────────────────

interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri: string;
}

// ── JWT helpers ──────────────────────────────────────────────────────────────

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function buildJwt(sa: ServiceAccount, scopes: string): string {
  const now = Math.floor(Date.now() / 1000);

  const header = base64url(Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const claims = base64url(
    Buffer.from(
      JSON.stringify({
        iss: sa.client_email,
        scope: scopes,
        aud: sa.token_uri,
        iat: now,
        exp: now + 3600,
      })
    )
  );

  const unsigned = `${header}.${claims}`;
  const signature = crypto.sign("RSA-SHA256", Buffer.from(unsigned), sa.private_key);

  return `${unsigned}.${base64url(signature)}`;
}

// ── Token cache ──────────────────────────────────────────────────────────────

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

const SCOPES = "https://www.googleapis.com/auth/indexing https://www.googleapis.com/auth/webmasters";

function getServiceAccount(): ServiceAccount | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    console.warn("[google-indexing] GOOGLE_SERVICE_ACCOUNT_JSON not set — skipping");
    return null;
  }
  try {
    return JSON.parse(raw) as ServiceAccount;
  } catch {
    console.warn("[google-indexing] Failed to parse GOOGLE_SERVICE_ACCOUNT_JSON");
    return null;
  }
}

async function getAccessToken(): Promise<string | null> {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;

  const sa = getServiceAccount();
  if (!sa) return null;

  const jwt = buildJwt(sa, SCOPES);

  const res = await fetch(sa.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });

  if (!res.ok) {
    const text = await res.text();
    console.warn(`[google-indexing] Token exchange failed (${res.status}): ${text}`);
    return null;
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = data.access_token;
  // Refresh 60s before actual expiry
  tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;
  return cachedToken;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Notify Google's Indexing API about a URL change.
 * Non-fatal: logs warnings on failure but never throws.
 */
export async function notifyGoogleIndexing(
  url: string,
  type: "URL_UPDATED" | "URL_DELETED" = "URL_UPDATED"
): Promise<void> {
  try {
    const token = await getAccessToken();
    if (!token) return;

    const res = await fetch("https://indexing.googleapis.com/v3/urlNotifications:publish", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url, type }),
    });

    if (res.ok) {
      console.log(`[google-indexing] Notified: ${type} ${url}`);
    } else {
      const text = await res.text();
      console.warn(`[google-indexing] Notify failed (${res.status}): ${text}`);
    }
  } catch (err) {
    console.warn("[google-indexing] notifyGoogleIndexing error:", err);
  }
}

/**
 * Resubmit the sitemap to Google Search Console.
 * Non-fatal: logs warnings on failure but never throws.
 */
export async function notifyGoogleOfSitemap(
  siteUrl = "https://keyatlas.io",
  sitemapUrl = "https://keyatlas.io/sitemap.xml"
): Promise<void> {
  try {
    const token = await getAccessToken();
    if (!token) return;

    const encodedSiteUrl = encodeURIComponent(siteUrl);
    const encodedSitemap = encodeURIComponent(sitemapUrl);
    const endpoint = `https://www.googleapis.com/webmasters/v3/sites/${encodedSiteUrl}/sitemaps/${encodedSitemap}`;

    const res = await fetch(endpoint, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (res.ok) {
      console.log(`[google-indexing] Sitemap resubmitted: ${sitemapUrl}`);
    } else {
      const text = await res.text();
      console.warn(`[google-indexing] Sitemap resubmit failed (${res.status}): ${text}`);
    }
  } catch (err) {
    console.warn("[google-indexing] notifyGoogleOfSitemap error:", err);
  }
}
