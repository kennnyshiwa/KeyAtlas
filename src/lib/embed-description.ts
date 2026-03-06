import { STATUS_LABELS, CATEGORY_LABELS } from "@/lib/constants";
import { formatPrice } from "@/lib/utils";
import type { ProjectCategory, ProjectStatus } from "@/generated/prisma/client";

/**
 * Format cents for embed text. Uses formatPrice but drops ".00" when there are
 * no fractional cents so "$120.00" becomes "$120".
 */
function embedPrice(cents: number, currency: string): string {
  const formatted = formatPrice(cents, currency);
  return formatted.replace(/\.00$/, "");
}

/**
 * Build a compact embed description for OG/Twitter meta tags.
 * Example: "Group Buy · Keycaps · Cherry | 142 followers · 38 bookmarks | $55-$120"
 */
export function buildEmbedDescription(project: {
  status: ProjectStatus;
  category: ProjectCategory;
  profile?: string | null;
  followerCount?: number;
  favoriteCount?: number;
  priceMin?: number | null;
  priceMax?: number | null;
  currency?: string | null;
}): string {
  const segments: string[] = [];
  const cur = project.currency ?? "USD";

  // Segment 1: Status · Category · Profile
  const labels = [
    STATUS_LABELS[project.status],
    CATEGORY_LABELS[project.category],
  ];
  if (project.profile) {
    labels.push(project.profile);
  }
  segments.push(labels.join(" · "));

  // Segment 2: Social proof
  const social: string[] = [];
  if (project.followerCount != null && project.followerCount > 0) {
    social.push(`${project.followerCount} followers`);
  }
  if (project.favoriteCount != null && project.favoriteCount > 0) {
    social.push(`${project.favoriteCount} bookmarks`);
  }
  if (social.length > 0) {
    segments.push(social.join(" · "));
  }

  // Segment 3: Price range (cents → dollars, drop .00)
  if (project.priceMin != null && project.priceMax != null && project.priceMin !== project.priceMax) {
    segments.push(`${embedPrice(project.priceMin, cur)}-${embedPrice(project.priceMax, cur)}`);
  } else if (project.priceMin != null) {
    segments.push(embedPrice(project.priceMin, cur));
  } else if (project.priceMax != null) {
    segments.push(embedPrice(project.priceMax, cur));
  }

  return segments.join(" | ");
}
