import { NextRequest, NextResponse } from "next/server";
import { addDays } from "date-fns";
import { prisma } from "@/lib/prisma";
import { rateLimit, RATE_LIMIT_LIST } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const page = Math.max(Number(url.searchParams.get("page") ?? "1"), 1);
  const pageSize = Math.min(Math.max(Number(url.searchParams.get("page_size") ?? "20"), 1), 50);
  const offset = (page - 1) * pageSize;

  const rateKey = req.headers.get("x-forwarded-for") ?? "anon";
  const limited = await rateLimit(rateKey, "v1:discover:ending-soon", RATE_LIMIT_LIST);
  if (limited) return limited;

  const now = new Date();
  // Include midnight-stored dates that are still "today" by querying from start of current UTC day
  const startOfUtcDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const sevenDaysFromNow = addDays(now, 7);

  const where = {
    published: true,
    status: "GROUP_BUY" as const,
    gbEndDate: { gte: startOfUtcDay, lte: sevenDaysFromNow },
  };

  const [projects, total] = await Promise.all([
    prisma.project.findMany({
      where,
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        priceMin: true,
        priceMax: true,
        currency: true,
        heroImage: true,
        tags: true,
        gbStartDate: true,
        gbEndDate: true,
        createdAt: true,
        updatedAt: true,
        vendor: { select: { name: true } },
      },
      orderBy: { gbEndDate: "asc" },
      skip: offset,
      take: pageSize,
    }),
    prisma.project.count({ where }),
  ]);

  const data = projects.map((p) => ({
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
    vendors: p.vendor
      ? [
          {
            id: `${p.id}-vendor`,
            vendor: { id: "", name: p.vendor.name, slug: "", logo_url: null },
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
    follow_count: 0,
    favorite_count: 0,
    is_following: false,
    is_favorited: false,
    is_featured: false,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
  }));

  return NextResponse.json({
    data,
    total,
    page,
    page_size: pageSize,
    has_more: offset + data.length < total,
  });
}
