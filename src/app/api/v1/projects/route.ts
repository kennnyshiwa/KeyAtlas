import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { rateLimit, RATE_LIMIT_LIST } from "@/lib/rate-limit";
import type { ProjectCategory, ProjectStatus } from "@/generated/prisma/client";

export async function GET(req: NextRequest) {
  // Public read — optionally authenticated for personalized results later
  const user = await authenticateApiKey(req).catch(() => null);

  // Rate-limit by user id if authenticated, otherwise by IP
  const rateLimitKey = user?.id ?? (req.headers.get("x-forwarded-for") ?? "anon");
  const limited = await rateLimit(rateLimitKey, "v1:projects", RATE_LIMIT_LIST);
  if (limited) return limited;

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const limit = Math.min(Math.max(1, Number(searchParams.get("limit") ?? "20")), 50);
  const category = searchParams.get("category") as ProjectCategory | null;
  const status = searchParams.get("status") as ProjectStatus | null;
  const q = searchParams.get("q");
  const profile = searchParams.get("profile");
  const shipped = searchParams.get("shipped");
  const featured = searchParams.get("featured");
  const designer = searchParams.get("designer");
  const offset = (page - 1) * limit;

  const where = {
    published: true,
    ...(category && { category }),
    ...(status && { status }),
    ...(q && { title: { contains: q, mode: "insensitive" as const } }),
    ...(profile && { profile }),
    ...(shipped === "true" && { shipped: true }),
    ...(shipped === "false" && { shipped: false }),
    ...(featured === "true" && { featured: true }),
    ...(designer && { designer: { contains: designer, mode: "insensitive" as const } }),
  };

  const [projects, total] = await Promise.all([
    prisma.project.findMany({
      where,
      select: {
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
        shipped: true,
        tags: true,
        gbStartDate: true,
        gbEndDate: true,
        icDate: true,
        createdAt: true,
        vendor: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: offset,
      take: limit,
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
    follow_count: 0,
    favorite_count: 0,
    is_following: false,
    is_favorited: false,
    is_featured: false,
    created_at: p.createdAt,
    updated_at: p.createdAt,
  }));

  return NextResponse.json({
    data,
    total,
    page,
    page_size: limit,
    has_more: page * limit < total,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}
