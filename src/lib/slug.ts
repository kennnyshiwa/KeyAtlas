/**
 * Generate a URL-safe ASCII slug from arbitrary text.
 *
 * Non-ASCII letters (CJK, Cyrillic, etc.) are stripped so slugs stay
 * compatible with all URL parsers and never cause 404s.  The original
 * title is preserved separately — only the slug is restricted.
 */
export function slugify(text: string, maxLen = 120): string {
  return text
    .normalize("NFKD")                    // decompose accented chars (é → e + combining accent)
    .replace(/[\u0300-\u036f]/g, "")      // strip combining diacritical marks
    .toLowerCase()
    .trim()
    .replace(/[\u2010-\u2015]/g, "-")     // unicode dashes → hyphen
    .replace(/_/g, " ")                     // underscores → spaces before stripping
    .replace(/[^a-z0-9\s-]/g, "")         // keep only ASCII alphanumeric, spaces, hyphens
    .replace(/[\s-]+/g, "-")              // collapse whitespace/hyphens
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, maxLen);
}

/** Returns true when the slug contains only URL-safe ASCII characters. */
export function isSlugSafe(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}
