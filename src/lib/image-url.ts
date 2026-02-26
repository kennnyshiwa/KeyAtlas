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
 * Check whether a URL's pathname looks like it points to an image file.
 * Strips querystrings / fragments before checking.
 */
export function looksLikeImageUrl(pathname: string): boolean {
  const clean = pathname.split("?")[0].split("#")[0].toLowerCase();
  return IMAGE_EXTENSIONS.some((ext) => clean.endsWith(ext));
}
