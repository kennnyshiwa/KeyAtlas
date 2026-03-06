import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { rateLimit, RATE_LIMIT_LIST } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  const user = await authenticateApiKey(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = await rateLimit(user.id, "v1:profile:favorites", RATE_LIMIT_LIST);
  if (limited) return limited;

  const favorites = await prisma.favorite.findMany({
    where: { userId: user.id },
    include: {
      project: {
        include: {
          vendor: { select: { name: true, slug: true } },
          creator: { select: { id: true, username: true, displayName: true, image: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const data = favorites.map((f) => {
    const p = f.project;
    return {
      id: p.id,
      title: p.title,
      slug: p.slug,
      description: null,
      status: p.status,
      hero_image_url: p.heroImage,
      category: null,
      category_id: p.category,
      designer: p.creator
        ? {
            id: p.creator.id,
            username: p.creator.username,
            name: p.creator.displayName,
            avatar_url: p.creator.image,
            image: p.creator.image,
          }
        : null,
      pricing: {
        min_price: p.priceMin,
        max_price: p.priceMax,
        currency: p.currency,
      },
      vendors: [],
      gallery: [],
      tags: p.tags ?? [],
      links: [],
      estimated_delivery: p.estimatedDelivery,
      gb_start_date: p.gbStartDate,
      gb_end_date: p.gbEndDate,
      follow_count: 0,
      favorite_count: 0,
      is_following: false,
      is_favorited: true,
      is_featured: false,
      created_at: p.createdAt,
      updated_at: p.updatedAt,
    };
  });

  return NextResponse.json({ data, total: data.length });
}
