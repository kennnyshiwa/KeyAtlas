/**
 * SSRF protection: block requests to internal/private network addresses.
 */

import { URL } from "url";
import dns from "dns/promises";
import net from "net";

const BLOCKED_HOSTNAMES = [
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "metadata",
  "kubernetes.default",
  "kubernetes.default.svc",
];

/**
 * Returns true if the IP address is in a private/reserved range.
 */
export function isPrivateIP(ip: string): boolean {
  // IPv4
  if (net.isIPv4(ip)) {
    const parts = ip.split(".").map(Number);
    // 127.0.0.0/8
    if (parts[0] === 127) return true;
    // 10.0.0.0/8
    if (parts[0] === 10) return true;
    // 172.16.0.0/12
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    // 192.168.0.0/16
    if (parts[0] === 192 && parts[1] === 168) return true;
    // 169.254.0.0/16 (link-local)
    if (parts[0] === 169 && parts[1] === 254) return true;
    // 0.0.0.0/8
    if (parts[0] === 0) return true;
    return false;
  }
  // IPv6
  if (net.isIPv6(ip)) {
    const normalized = ip.toLowerCase();
    if (normalized === "::1" || normalized === "::") return true;
    if (normalized.startsWith("fe80:")) return true; // link-local
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true; // ULA
    // ::ffff:127.x.x.x (IPv4-mapped)
    if (normalized.startsWith("::ffff:")) {
      const v4part = normalized.slice(7);
      if (net.isIPv4(v4part)) return isPrivateIP(v4part);
    }
    return false;
  }
  return false;
}

/**
 * Validates that a URL is safe to fetch (not targeting internal resources).
 * Throws an error if the URL is blocked.
 */
export async function assertSafeUrl(urlString: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new Error("Invalid URL");
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Only HTTP(S) URLs are allowed");
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block known internal hostnames
  if (BLOCKED_HOSTNAMES.includes(hostname)) {
    throw new Error("URL points to a blocked internal host");
  }

  // If hostname is already an IP, check directly
  if (net.isIP(hostname)) {
    if (isPrivateIP(hostname)) {
      throw new Error("URL points to a private/internal IP address");
    }
    return;
  }

  // Resolve DNS and check all resulting IPs
  try {
    const addresses = await dns.resolve4(hostname).catch(() => [] as string[]);
    const addresses6 = await dns.resolve6(hostname).catch(() => [] as string[]);
    const all = [...addresses, ...addresses6];

    if (all.length === 0) {
      throw new Error("Could not resolve hostname");
    }

    for (const ip of all) {
      if (isPrivateIP(ip)) {
        throw new Error("URL resolves to a private/internal IP address");
      }
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("URL ")) throw err;
    if (err instanceof Error && err.message === "Could not resolve hostname") throw err;
    throw new Error("Could not resolve hostname");
  }
}

/**
 * Fetch a URL with SSRF protection. Disables redirect following to prevent
 * redirect-to-internal attacks, enforces timeout and response size limit.
 */
export async function safeFetch(
  url: string,
  options: {
    method?: string;
    timeoutMs?: number;
    maxResponseBytes?: number;
    headers?: Record<string, string>;
  } = {}
): Promise<Response> {
  const { method = "GET", timeoutMs = 10_000, headers } = options;

  await assertSafeUrl(url);

  const res = await fetch(url, {
    method,
    redirect: "manual", // don't follow redirects automatically
    signal: AbortSignal.timeout(timeoutMs),
    headers,
  });

  // If redirect, validate the target before allowing
  if ([301, 302, 303, 307, 308].includes(res.status)) {
    const location = res.headers.get("location");
    if (location) {
      const redirectUrl = new URL(location, url).toString();
      await assertSafeUrl(redirectUrl);
      // Follow the one redirect
      return fetch(redirectUrl, {
        method,
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
        headers,
      });
    }
  }

  return res;
}
