import type { ProjectStatus } from "@/generated/prisma/client";

type CompletenessProject = {
  title: string | null;
  description: string | null;
  heroImage: string | null;
  status: ProjectStatus;
  gbStartDate: Date | null;
  gbEndDate: Date | null;
  vendorId?: string | null;
  linkCount?: number;
  projectVendorCount?: number;
};

export function computeProjectDataCompleteness(project: CompletenessProject) {
  const titleWeight = 15;
  const descriptionWeight = 20;
  const heroImageWeight = 15;
  const statusWeight = 10;
  const gbDatesWeight = 20;
  const vendorLinksWeight = 20;

  let score = 0;

  if ((project.title || "").trim().length > 0) score += titleWeight;
  if ((project.description || "").trim().length > 0) score += descriptionWeight;
  if ((project.heroImage || "").trim().length > 0) score += heroImageWeight;
  if (project.status) score += statusWeight;

  if (project.status === "GROUP_BUY") {
    if (project.gbStartDate) score += gbDatesWeight / 2;
    if (project.gbEndDate) score += gbDatesWeight / 2;
  } else {
    score += gbDatesWeight;
  }

  const hasVendorOrLinks =
    Boolean(project.vendorId) ||
    (project.linkCount ?? 0) > 0 ||
    (project.projectVendorCount ?? 0) > 0;

  if (hasVendorOrLinks) score += vendorLinksWeight;

  return Math.max(0, Math.min(100, Math.round(score)));
}
