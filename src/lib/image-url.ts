/** Image file extensions accepted by the validator (case-insensitive). */
export const IMAGE_EXTENSIONS = [
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".avif",
];

/**
 * Recognize image paths and Cloudflare Images delivery URLs. This is only a
 * format hint: callers must still verify the remote content through safeFetch.
 * Cloudflare URLs need the full URL so a lookalike host cannot bypass the hint.
 */
export function looksLikeImageUrl(value: string): boolean {
  let pathname = value;
  try {
    const url = new URL(value);
    pathname = url.pathname;
    if (
      url.protocol === "https:" &&
      url.hostname === "imagedelivery.net" &&
      !url.username && !url.password && !url.port &&
      /^\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)
    ) {
      return true;
    }
  } catch {
    // Existing callers can supply just a pathname.
  }
  const clean = pathname.split("?")[0].split("#")[0].toLowerCase();
  return IMAGE_EXTENSIONS.some((ext) => clean.endsWith(ext));
}
