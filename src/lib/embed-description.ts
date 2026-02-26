import { STATUS_LABELS, CATEGORY_LABELS } from "@/lib/constants";
import type { ProjectCategory, ProjectStatus } from "@/generated/prisma/client";

/**
 * Build a compact embed description for OG/Twitter meta tags.
 * Format: "Interest Check - Keycaps - Cherry"
 *         (status - category - profile)
 */
export function buildEmbedDescription(project: {
  status: ProjectStatus;
  category: ProjectCategory;
  profile?: string | null;
}): string {
  const parts = [
    STATUS_LABELS[project.status],
    CATEGORY_LABELS[project.category],
  ];
  if (project.profile) {
    parts.push(project.profile);
  }
  return parts.join(" - ");
}
