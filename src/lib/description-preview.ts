/**
 * Strip HTML tags from a string and return a plain-text preview.
 * Used for generating description previews on project list items.
 */
export function stripHtmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/p>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Generate a plain-text description preview from HTML content.
 * Returns null if the input is empty/null or produces no meaningful text.
 */
export function generateDescriptionPreview(
  html: string | null | undefined,
  maxLength = 120,
): string | null {
  if (!html) return null;

  const plain = stripHtmlToPlainText(html);
  if (!plain) return null;

  if (plain.length <= maxLength) return plain;

  // Truncate at word boundary
  const truncated = plain.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(" ");
  return (lastSpace > maxLength * 0.6 ? truncated.slice(0, lastSpace) : truncated) + "…";
}
