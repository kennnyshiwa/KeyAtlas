export function slugify(text: string, maxLen = 120) {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .trim()
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[^\p{Letter}\p{Number}\s-]+/gu, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, maxLen);
}
