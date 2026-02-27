import { prisma } from "@/lib/prisma";
import { dispatchNotification } from "@/lib/notifications/service";
import type { ProjectCategory, ProjectStatus } from "@/generated/prisma/client";

interface ProjectForMatching {
  id: string;
  title: string;
  slug: string;
  category: ProjectCategory;
  status: ProjectStatus;
  profile: string | null;
  designer: string | null;
  vendorId: string | null;
  shipped: boolean;
  tags: string[];
  creatorId: string;
}

interface SavedFilterCriteria {
  status?: string;
  category?: string;
  profile?: string;
  designer?: string;
  vendor?: string;
  shipped?: boolean;
  q?: string;
}

function projectMatchesCriteria(
  project: ProjectForMatching,
  criteria: SavedFilterCriteria
): boolean {
  if (criteria.status && project.status !== criteria.status) return false;

  if (criteria.category) {
    const cats = criteria.category.split(",").filter(Boolean);
    if (cats.length > 0 && !cats.includes(project.category)) return false;
  }

  if (criteria.profile) {
    const profiles = criteria.profile.split(",").filter(Boolean);
    if (profiles.length > 0 && (!project.profile || !profiles.includes(project.profile)))
      return false;
  }

  if (criteria.designer) {
    if (
      !project.designer ||
      !project.designer.toLowerCase().includes(criteria.designer.toLowerCase())
    )
      return false;
  }

  if (criteria.vendor) {
    const vendorIds = criteria.vendor.split(",").filter(Boolean);
    if (vendorIds.length > 0 && (!project.vendorId || !vendorIds.includes(project.vendorId)))
      return false;
  }

  if (criteria.shipped === true && !project.shipped) return false;

  if (criteria.q) {
    const q = criteria.q.toLowerCase();
    if (!project.title.toLowerCase().includes(q)) return false;
  }

  return true;
}

/**
 * Check all saved filters with notify=true and dispatch notifications
 * for users whose watchlist matches the newly published project.
 * Skips the project creator and deduplicates.
 */
export async function notifyWatchlistMatches(project: ProjectForMatching) {
  const savedFilters = await prisma.savedFilter.findMany({
    where: {
      notify: true,
      userId: { not: project.creatorId },
    },
    select: {
      id: true,
      name: true,
      userId: true,
      criteria: true,
    },
  });

  // Group by user to avoid duplicate notifications for same project
  const userMatches = new Map<string, { filterId: string; filterName: string }>();

  for (const sf of savedFilters) {
    const criteria = sf.criteria as SavedFilterCriteria;
    if (!projectMatchesCriteria(project, criteria)) continue;

    // Only keep first matching filter per user (avoid spam)
    if (userMatches.has(sf.userId)) continue;

    // Check dedup table
    const existing = await prisma.watchlistNotification.findUnique({
      where: {
        savedFilterId_projectId_userId: {
          savedFilterId: sf.id,
          projectId: project.id,
          userId: sf.userId,
        },
      },
    });
    if (existing) continue;

    userMatches.set(sf.userId, { filterId: sf.id, filterName: sf.name });
  }

  if (userMatches.size === 0) return;

  // Record dedup entries
  const dedupData = Array.from(userMatches.entries()).map(([userId, { filterId }]) => ({
    savedFilterId: filterId,
    projectId: project.id,
    userId,
  }));

  await prisma.watchlistNotification.createMany({
    data: dedupData,
    skipDuplicates: true,
  });

  // Dispatch notifications
  await dispatchNotification({
    recipients: Array.from(userMatches.keys()),
    preferenceType: "WATCHLIST_MATCHES",
    notificationType: "WATCHLIST_MATCH",
    title: "New project matches your watchlist",
    message: `"${project.title}" matches your saved filter.`,
    link: `/projects/${project.slug}`,
    emailSubject: `New project matches your watchlist: ${project.title}`,
    emailHeading: "Watchlist Match",
    emailCtaLabel: "View Project",
  });
}
