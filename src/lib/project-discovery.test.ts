import { describe, expect, it } from "vitest";
import {
  isRecentlyUpdated,
  scoreFollowedProjectRecommendation,
  scoreTrendingProject,
} from "@/lib/project-discovery";

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

  it("strongly prefers same-profile projects for followed recommendations", () => {
    const anchor = {
      category: "KEYCAPS" as const,
      status: "GROUP_BUY" as const,
      profile: "DCS",
    };

    const sameProfile = scoreFollowedProjectRecommendation(
      anchor,
      {
        category: "KEYCAPS",
        status: "GROUP_BUY",
        profile: "DCS",
        favoritesCount: 0,
        followersCount: 0,
        commentsCount: 0,
        updatesCount: 0,
        updatedAt: new Date("2026-03-03T12:00:00.000Z"),
        createdAt: new Date("2026-02-25T12:00:00.000Z"),
      },
      now
    );

    const differentProfile = scoreFollowedProjectRecommendation(
      anchor,
      {
        category: "KEYCAPS",
        status: "GROUP_BUY",
        profile: "GMK",
        favoritesCount: 0,
        followersCount: 0,
        commentsCount: 0,
        updatesCount: 0,
        updatedAt: new Date("2026-03-03T12:00:00.000Z"),
        createdAt: new Date("2026-02-25T12:00:00.000Z"),
      },
      now
    );

    expect(sameProfile).toBeGreaterThan(differentProfile);
  });

  it("rejects projects from different categories for followed recommendations", () => {
    const score = scoreFollowedProjectRecommendation(
      {
        category: "KEYCAPS",
        status: "INTEREST_CHECK",
        profile: "DSS",
      },
      {
        category: "KEYBOARDS",
        status: "INTEREST_CHECK",
        profile: undefined,
        favoritesCount: 10,
        followersCount: 10,
        commentsCount: 10,
        updatesCount: 10,
        updatedAt: new Date("2026-03-04T12:00:00.000Z"),
        createdAt: new Date("2026-03-04T12:00:00.000Z"),
      },
      now
    );

    expect(score).toBe(Number.NEGATIVE_INFINITY);
  });
});
