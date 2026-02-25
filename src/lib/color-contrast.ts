/**
 * WCAG 2.1 color contrast utilities.
 *
 * All colours are expected as 3- or 6-digit hex strings (with or without #).
 */

/** Parse a hex colour string to [r, g, b] in 0-255. Returns null on invalid input. */
export function parseHex(hex: string): [number, number, number] | null {
  const h = hex.replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(h)) {
    return [
      parseInt(h[0] + h[0], 16),
      parseInt(h[1] + h[1], 16),
      parseInt(h[2] + h[2], 16),
    ];
  }
  if (/^[0-9a-fA-F]{6}$/.test(h)) {
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
    ];
  }
  return null;
}

/** Relative luminance per WCAG 2.1 */
export function relativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/** Contrast ratio between two colours (>= 1). */
export function contrastRatio(hex1: string, hex2: string): number | null {
  const c1 = parseHex(hex1);
  const c2 = parseHex(hex2);
  if (!c1 || !c2) return null;
  const l1 = relativeLuminance(...c1);
  const l2 = relativeLuminance(...c2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** WCAG AA requires >= 4.5 for normal text. */
export const WCAG_AA_THRESHOLD = 4.5;

/** Check if the pair passes WCAG AA for normal text. */
export function passesWcagAA(fgHex: string, bgHex: string): boolean {
  const ratio = contrastRatio(fgHex, bgHex);
  return ratio != null && ratio >= WCAG_AA_THRESHOLD;
}
