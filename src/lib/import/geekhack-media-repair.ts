import crypto from "crypto";
import { safeFetch } from "@/lib/security/ssrf-guard";
import { normalizeMirrorableImageUrl } from "@/lib/import/imgur-mirror";

export type GeekhackLink = { label: string; type: string; url: string };
export type ImageAssetIdentity = { sha256: string; url: string };

export function selectGeekhackSourceUrl(links: GeekhackLink[], explicit?: string): string {
  if (explicit) return explicit;
  const geekhack = links.filter((link) => link.type === "GEEKHACK");
  const gb = geekhack.filter((link) => /\b(?:gb|group buy)\b/i.test(link.label));
  if (gb.length === 1) return gb[0].url;
  if (gb.length > 1) throw new Error("Multiple GB Geekhack links; pass --source-url");
  const ic = geekhack.filter((link) => /\b(?:ic|interest check)\b/i.test(link.label));
  if (ic.length === 1) return ic[0].url;
  if (geekhack.length === 1) return geekhack[0].url;
  throw new Error(geekhack.length === 0
    ? "No Geekhack source link"
    : "Ambiguous Geekhack links; pass --source-url");
}

export function matchSourceImagesToGallery(
  sourceUrls: string[],
  galleryUrls: string[],
  assets: ImageAssetIdentity[],
  sha256BySource: ReadonlyMap<string, string>,
): Map<string, string> {
  const result = new Map<string, string>();
  const galleryByNormalized = new Map(galleryUrls.map((url) => [normalizeMirrorableImageUrl(url), url]));
  const gallerySet = new Set(galleryUrls);
  const galleryByHash = new Map(
    assets.filter((asset) => gallerySet.has(asset.url)).map((asset) => [asset.sha256, asset.url]),
  );

  for (const rawSource of sourceUrls) {
    const source = normalizeMirrorableImageUrl(rawSource);
    const exact = galleryByNormalized.get(source);
    const hashMatch = sha256BySource.get(source);
    const matched = exact ?? (hashMatch ? galleryByHash.get(hashMatch) : undefined);
    if (matched) result.set(source, matched);
  }
  return result;
}

export async function sha256RemoteImage(url: string): Promise<string> {
  const response = await safeFetch(url, {
    headers: { accept: "image/*", "user-agent": "KeyAtlas Media Repair/1.0" },
    timeoutMs: 12_000,
  });
  if (!response.ok) throw new Error(`Source image fetch failed (${response.status}): ${url}`);
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("image/")) {
    throw new Error(`Source is not an image (${contentType || "unknown"}): ${url}`);
  }
  return crypto.createHash("sha256").update(Buffer.from(await response.arrayBuffer())).digest("hex");
}

type FetchResponse = Pick<Response, "ok" | "headers">;
type ValidateFetch = (url: string, init: RequestInit) => Promise<FetchResponse>;

export async function validateImageUrl(
  url: string,
  fetcher: ValidateFetch = (value, init) => fetch(value, init),
): Promise<boolean> {
  const request = async (method: "HEAD" | "GET") => fetcher(url, {
    method,
    redirect: "follow",
    signal: AbortSignal.timeout(8_000),
    headers: { accept: "image/*", "user-agent": "KeyAtlas Media Repair/1.0" },
  });
  try {
    const head = await request("HEAD");
    if (head.ok && (head.headers.get("content-type") ?? "").toLowerCase().startsWith("image/")) return true;
  } catch {
    // Some image CDNs reject or time out HEAD; still verify with GET.
  }
  try {
    const get = await request("GET");
    return get.ok && (get.headers.get("content-type") ?? "").toLowerCase().startsWith("image/");
  } catch {
    return false;
  }
}

export async function assertValidDescriptionImages(
  html: string,
  validator: (url: string) => Promise<boolean> = validateImageUrl,
): Promise<void> {
  const urls = [...new Set(Array.from(html.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi), (match) => match[1]))];
  const invalid: string[] = [];
  for (const url of urls) if (!(await validator(url))) invalid.push(url);
  if (invalid.length) throw new Error(`Invalid description image URLs: ${invalid.join(", ")}`);
}
