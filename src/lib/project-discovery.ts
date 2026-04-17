import type { ProjectCategory, ProjectStatus } from "@/generated/prisma/client";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

interface TrendSignals {
  favoritesCount: number;
  followersCount: number;
  commentsCount: number;
  updatesCount: number;
  updatedAt: Date;
  createdAt: Date;
}

interface FollowRecommendationAnchor {
  category: ProjectCategory;
  status: ProjectStatus;
  profile?: string | null;
}

interface FollowRecommendationCandidate extends TrendSignals {
  category: ProjectCategory;
  status: ProjectStatus;
  profile?: string | null;
}

export function scoreTrendingProject(project: TrendSignals, now = new Date()): number {
  const ageInDays = Math.max(
    0,
    (now.getTime() - project.updatedAt.getTime()) / ONE_DAY_MS
  );
  const freshnessMultiplier = ageInDays <= 7 ? 1.2 : ageInDays <= 14 ? 1 : 0.75;

  const baseScore =
    project.favoritesCount * 3 +
    project.followersCount * 4 +
    project.commentsCount * 2 +
    project.updatesCount * 3;

  const launchBoost =
    (now.getTime() - project.createdAt.getTime()) / ONE_DAY_MS <= 7 ? 5 : 0;

  return Math.round((baseScore + launchBoost) * freshnessMultiplier * 100) / 100;
}

export function isRecentlyUpdated(updatedAt: Date, now = new Date()): boolean {
  return now.getTime() - updatedAt.getTime() <= 7 * ONE_DAY_MS;
}

export function scoreFollowedProjectRecommendation(
  anchor: FollowRecommendationAnchor,
  candidate: FollowRecommendationCandidate,
  now = new Date()
): number {
  if (candidate.category !== anchor.category) return Number.NEGATIVE_INFINITY;

  let score = 40;

  const anchorProfile = anchor.profile?.trim().toLowerCase();
  const candidateProfile = candidate.profile?.trim().toLowerCase();

  if (anchorProfile && candidateProfile) {
    if (anchorProfile === candidateProfile) {
      score += 24;
    } else {
      score -= 8;
    }
  }

  if (candidate.status === anchor.status) {
    score += 10;
  }

  const updatedAgeDays = Math.max(0, (now.getTime() - candidate.updatedAt.getTime()) / ONE_DAY_MS);
  if (updatedAgeDays <= 7) score += 14;
  else if (updatedAgeDays <= 30) score += 10;
  else if (updatedAgeDays <= 60) score += 5;
  else if (updatedAgeDays > 120) score -= 12;

  const createdAgeDays = Math.max(0, (now.getTime() - candidate.createdAt.getTime()) / ONE_DAY_MS);
  if (createdAgeDays <= 14) score += 6;
  else if (createdAgeDays <= 30) score += 3;

  const engagementScore = Math.min(
    20,
    candidate.favoritesCount * 1.5 +
      candidate.followersCount * 2 +
      candidate.commentsCount +
      candidate.updatesCount * 2
  );

  return Math.round((score + engagementScore) * 100) / 100;
}
