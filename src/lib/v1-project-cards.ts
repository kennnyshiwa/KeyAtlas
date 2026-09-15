import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeProjectProfiles } from "@/lib/project-profiles";
import type { NextResponse } from "next/server";

// Personalized representations must never enter a shared or device HTTP cache.
export function privateViewerResponse(response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Authorization, Cookie");
  return response;
}

export const projectCardSelect = {
  id: true,
  title: true,
  slug: true,
  category: true,
  status: true,
  priceMin: true,
  priceMax: true,
  currency: true,
  heroImage: true,
  designer: true,
  profile: true,
  profiles: true,
  tags: true,
  gbStartDate: true,
  gbEndDate: true,
  icDate: true,
  createdAt: true,
  updatedAt: true,
  vendor: { select: { name: true } },
  _count: { select: { favorites: true, comments: true } },
} satisfies Prisma.ProjectSelect;
type Card = Prisma.ProjectGetPayload<{ select: typeof projectCardSelect }>;

export async function projectCards(projects: Card[], userId?: string) {
  // Batch-fetch follow counts for all projects in one query
  const projectIds = projects.map((p) => p.id);
  const followCounts = projectIds.length > 0
    ? await prisma.follow.groupBy({
        by: ["targetId"],
        where: { targetType: "PROJECT", targetId: { in: projectIds } },
        _count: true,
      })
    : [];
  const followMap = new Map(followCounts.map((f) => [f.targetId, f._count]));

  const [viewerFollows, viewerFavorites, viewerCollection] = userId && projectIds.length
    ? await Promise.all([
        prisma.follow.findMany({ where: { userId, targetType: "PROJECT", targetId: { in: projectIds } }, select: { targetId: true } }),
        prisma.favorite.findMany({ where: { userId, projectId: { in: projectIds } }, select: { projectId: true } }),
        prisma.userCollection.findMany({ where: { userId, projectId: { in: projectIds } }, select: { projectId: true } }),
      ])
    : [[], [], []];
  const following = new Set(viewerFollows.map((f) => f.targetId));
  const favorites = new Set(viewerFavorites.map((f) => f.projectId));
  const collection = new Set(viewerCollection.map((f) => f.projectId));

  return projects.map((p) => ({
    id: p.id,
    title: p.title,
    slug: p.slug,
    description: null,
    status: p.status,
    hero_image_url: p.heroImage,
    category: p.category,
    category_id: p.category,
    profile: p.profile,
    profiles: normalizeProjectProfiles(p.profiles, p.profile),
    designer: null,
    pricing: {
      min_price: p.priceMin,
      max_price: p.priceMax,
      currency: p.currency,
    },
    vendors: p.vendor
      ? [
          {
            id: `${p.id}-vendor`,
            vendor: {
              id: "",
              name: p.vendor.name,
              slug: "",
              logo_url: null,
            },
            url: null,
            region: null,
          },
        ]
      : [],
    gallery: [],
    timeline: [],
    comments: [],
    tags: p.tags ?? [],
    links: [],
    estimated_delivery: null,
    gb_start_date: p.gbStartDate,
    gb_end_date: p.gbEndDate,
    follow_count: followMap.get(p.id) ?? 0,
    favorite_count: p._count.favorites,
    comment_count: p._count.comments,
    is_following: following.has(p.id),
    is_favorited: favorites.has(p.id),
    is_in_collection: collection.has(p.id),
    is_featured: false,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
  }));

}
