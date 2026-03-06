import { STATUS_LABELS, CATEGORY_LABELS } from "@/lib/constants";
import type { ProjectCategory, ProjectStatus } from "@/generated/prisma/client";

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

  // Segment 3: Price range
  const cur = project.currency ?? "USD";
  const sym = cur === "USD" ? "$" : cur === "EUR" ? "€" : cur === "GBP" ? "£" : `${cur} `;
  if (project.priceMin != null && project.priceMax != null) {
    segments.push(`${sym}${project.priceMin}-${sym}${project.priceMax}`);
  } else if (project.priceMin != null) {
    segments.push(`${sym}${project.priceMin}`);
  } else if (project.priceMax != null) {
    segments.push(`${sym}${project.priceMax}`);
  }

  return segments.join(" | ");
}
