import { describe, expect, it } from "vitest";
import { isRecentlyUpdated, scoreTrendingProject } from "@/lib/project-discovery";

describe("project discovery helpers", () => {
  const now = new Date("2026-03-05T12:00:00.000Z");

  it("scores recently active projects higher", () => {
    const older = scoreTrendingProject(
      {
        favoritesCount: 10,
        followersCount: 8,
        commentsCount: 4,
        updatesCount: 2,
        updatedAt: new Date("2026-02-18T12:00:00.000Z"),
        createdAt: new Date("2025-12-01T12:00:00.000Z"),
      },
      now
    );

    const fresh = scoreTrendingProject(
      {
        favoritesCount: 10,
        followersCount: 8,
        commentsCount: 4,
        updatesCount: 2,
        updatedAt: new Date("2026-03-03T12:00:00.000Z"),
        createdAt: new Date("2025-12-01T12:00:00.000Z"),
      },
      now
    );

    expect(fresh).toBeGreaterThan(older);
  });

  it("marks updates within 7 days as recent", () => {
    expect(isRecentlyUpdated(new Date("2026-03-01T12:00:00.000Z"), now)).toBe(true);
    expect(isRecentlyUpdated(new Date("2026-02-20T12:00:00.000Z"), now)).toBe(false);
  });
});
