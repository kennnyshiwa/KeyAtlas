import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { rateLimit, RATE_LIMIT_DETAIL } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  const user = await authenticateApiKey(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = await rateLimit(user.id, "v1:profile", RATE_LIMIT_DETAIL);
  if (limited) return limited;

  const profile = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      username: true,
      email: true,
      displayName: true,
      image: true,
      bio: true,
      role: true,
      createdAt: true,
      projects: {
        where: { published: true },
        select: {
          id: true,
          title: true,
          slug: true,
          status: true,
          heroImage: true,
          priceMin: true,
          priceMax: true,
          currency: true,
          tags: true,
          gbStartDate: true,
          gbEndDate: true,
          estimatedDelivery: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: "desc" },
      },
      _count: {
        select: {
          projects: true,
          followers: true,
          following: true,
        },
      },
    },
  });

  if (!profile) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { _count, projects, ...rest } = profile;

  return NextResponse.json({
    data: {
      ...rest,
      avatar_url: rest.image,
      projects: projects.map((p) => ({
        id: p.id,
        title: p.title,
        slug: p.slug,
        description: null,
        status: p.status,
        hero_image_url: p.heroImage,
        category: null,
        category_id: null,
        designer: null,
        pricing: {
          min_price: p.priceMin,
          max_price: p.priceMax,
          currency: p.currency,
        },
        vendors: [],
        gallery: [],
        timeline: [],
        comments: [],
        tags: p.tags ?? [],
        links: [],
        estimated_delivery: p.estimatedDelivery,
        gb_start_date: p.gbStartDate,
        gb_end_date: p.gbEndDate,
        follow_count: 0,
        favorite_count: 0,
        is_following: false,
        is_favorited: false,
        is_featured: false,
        created_at: p.createdAt,
        updated_at: p.updatedAt,
      })),
      project_count: _count.projects,
      follower_count: _count.followers,
      following_count: _count.following,
    },
  });
}
