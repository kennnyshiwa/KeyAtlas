const ONE_DAY_MS = 24 * 60 * 60 * 1000;

interface TrendSignals {
  favoritesCount: number;
  followersCount: number;
  commentsCount: number;
  updatesCount: number;
  updatedAt: Date;
  createdAt: Date;
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
