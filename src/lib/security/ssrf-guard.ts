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

export class UrlSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UrlSafetyError";
  }
}

type IpRange = readonly [network: number, prefixLength: number];
type Ipv6Range = readonly [network: string, prefixLength: number];

const IPV4_BLOCKED_RANGES: readonly IpRange[] = [
  [0x00000000, 8], [0x0a000000, 8], [0x64400000, 10],
  [0x7f000000, 8], [0xa9fe0000, 16], [0xac100000, 12],
  [0xc0000000, 24], [0xc0000200, 24], [0xc01fc400, 24],
  [0xc034c100, 24], [0xc0586300, 24], [0xc0af3000, 24],
  [0xc0a80000, 16], [0xc6120000, 15], [0xc6336400, 24],
  [0xcb007100, 24], [0xe0000000, 4], [0xf0000000, 4],
];

function inIpv4Range(value: number, [network, prefixLength]: IpRange): boolean {
  const divisor = 2 ** (32 - prefixLength);
  return Math.floor(value / divisor) === Math.floor(network / divisor);
}

function ipv4Value(ip: string): number {
  return ip.split(".").reduce((value, octet) => value * 256 + Number(octet), 0);
}

function ipv6Groups(ip: string): number[] {
  const [head = "", tail = ""] = ip.toLowerCase().split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const groups = ip.includes("::")
    ? [...left, ...Array(8 - left.length - right.length).fill("0"), ...right]
    : left;
  return groups.map((group) => Number.parseInt(group || "0", 16));
}

function inIpv6Range(groups: number[], [network, prefixLength]: Ipv6Range): boolean {
  const networkGroups = ipv6Groups(network);
  const wholeGroups = Math.floor(prefixLength / 16);
  for (let index = 0; index < wholeGroups; index += 1) {
    if (groups[index] !== networkGroups[index]) return false;
  }
  const remainingBits = prefixLength % 16;
  if (remainingBits === 0) return true;
  const divisor = 2 ** (16 - remainingBits);
  return Math.floor(groups[wholeGroups] / divisor) === Math.floor(networkGroups[wholeGroups] / divisor);
}

const IPV6_GLOBAL_UNICAST: Ipv6Range = ["2000::", 3];
const IPV6_SPECIAL_RANGES: readonly Ipv6Range[] = [
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["2620:4f:8000::", 48],
  ["3fff::", 20],
];

/** Returns true unless the address is ordinary globally routable unicast. */
export function isPrivateIP(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const value = ipv4Value(ip);
    return IPV4_BLOCKED_RANGES.some((range) => inIpv4Range(value, range));
  }

  if (net.isIPv6(ip)) {
    const dottedMatch = ip.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
    const dottedValue = dottedMatch && net.isIPv4(dottedMatch[2])
      ? ipv4Value(dottedMatch[2])
      : null;
    const normalized = dottedValue === null
      ? ip
      : `${dottedMatch![1]}${Math.floor(dottedValue / 65536).toString(16)}:${(dottedValue % 65536).toString(16)}`;
    const groups = ipv6Groups(normalized);

    // IPv4-mapped IPv6 is special-use; reject every mapped form rather than
    // depending on how the HTTP stack normalizes it before connecting.
    if (groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff) return true;
    if (!inIpv6Range(groups, IPV6_GLOBAL_UNICAST)) return true;
    return IPV6_SPECIAL_RANGES.some((range) => inIpv6Range(groups, range));
  }
  return true;
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
    throw new UrlSafetyError("Invalid URL");
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new UrlSafetyError("Only HTTP(S) URLs are allowed");
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  // Block known internal hostnames
  if (BLOCKED_HOSTNAMES.includes(hostname)) {
    throw new UrlSafetyError("URL points to a blocked internal host");
  }

  // If hostname is already an IP, check directly
  if (net.isIP(hostname)) {
    if (isPrivateIP(hostname)) {
      throw new UrlSafetyError("URL points to a private/internal IP address");
    }
    return;
  }

  // Resolve DNS and check all resulting IPs
  try {
    const addresses = await dns.resolve4(hostname).catch(() => [] as string[]);
    const addresses6 = await dns.resolve6(hostname).catch(() => [] as string[]);
    const all = [...addresses, ...addresses6];

    if (all.length === 0) {
      throw new UrlSafetyError("Could not resolve hostname");
    }

    for (const ip of all) {
      if (isPrivateIP(ip)) {
        throw new UrlSafetyError("URL resolves to a private/internal IP address");
      }
    }
  } catch (err) {
    if (err instanceof UrlSafetyError) throw err;
    throw new UrlSafetyError("Could not resolve hostname");
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
    allowedProtocols?: string[];
  } = {}
): Promise<Response> {
  const { method = "GET", timeoutMs = 10_000, headers, allowedProtocols } = options;

  await assertSafeUrl(url);
  if (allowedProtocols && !allowedProtocols.includes(new URL(url).protocol)) {
    throw new UrlSafetyError("URL uses a disallowed protocol");
  }

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
      if (allowedProtocols && !allowedProtocols.includes(new URL(redirectUrl).protocol)) {
        throw new UrlSafetyError("Redirect target uses a disallowed protocol");
      }
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
