/**
 * Strip HTML tags from a string and collapse whitespace.
 * Useful for generating plain-text meta/OG descriptions from rich-text content.
 */
export function stripHtml(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => decodeCodePoint(Number(code), _))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => decodeCodePoint(parseInt(hex, 16), _));
}

function decodeCodePoint(value: number, fallback: string): string {
  if (!Number.isFinite(value) || value <= 0 || value > 0x10ffff) return fallback;

  try {
    return String.fromCodePoint(value);
  } catch {
    return fallback;
  }
}
