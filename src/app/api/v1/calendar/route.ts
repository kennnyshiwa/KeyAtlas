import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { rateLimit, RATE_LIMIT_LIST } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  const user = await authenticateApiKey(req).catch(() => null);
  const rateLimitKey = user?.id ?? (req.headers.get("x-forwarded-for") ?? "anon");
  const limited = await rateLimit(rateLimitKey, "v1:calendar", RATE_LIMIT_LIST);
  if (limited) return limited;

  const { searchParams } = new URL(req.url);
  const now = new Date();
  const month = Number(searchParams.get("month") ?? now.getUTCMonth() + 1);
  const year = Number(searchParams.get("year") ?? now.getUTCFullYear());

  if (month < 1 || month > 12 || !Number.isInteger(month)) {
    return NextResponse.json({ error: "month must be 1-12" }, { status: 400 });
  }
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: "Invalid year" }, { status: 400 });
  }

  const startOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const endOfMonth = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

  const [projects, deliveryProjects] = await Promise.all([
    prisma.project.findMany({
      where: {
        published: true,
        OR: [
          { icDate: { gte: startOfMonth, lte: endOfMonth } },
          { gbStartDate: { gte: startOfMonth, lte: endOfMonth } },
          { gbEndDate: { gte: startOfMonth, lte: endOfMonth } },
          { gbStartDate: { lte: startOfMonth }, gbEndDate: { gte: endOfMonth } },
        ],
      },
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        heroImage: true,
        category: true,
        icDate: true,
        gbStartDate: true,
        gbEndDate: true,
      },
      orderBy: { gbStartDate: "asc" },
    }),
    prisma.project.findMany({
      where: {
        published: true,
        estimatedDelivery: { not: null },
      },
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
        estimatedDelivery: true,
        gbStartDate: true,
        gbEndDate: true,
        createdAt: true,
      },
      take: 200,
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const events = projects.flatMap((p) => {
    const out: Array<{
      id: string;
      title: string;
      slug: string;
      type: string;
      date: string;
      status: string;
      hero_image_url: string | null;
      category: string | null;
    }> = [];

    if (p.icDate) {
      out.push({
        id: `${p.id}-ic`,
        title: p.title,
        slug: p.slug,
        type: "ic",
        date: p.icDate.toISOString(),
        status: p.status,
        hero_image_url: p.heroImage,
        category: p.category,
      });
    }
    if (p.gbStartDate) {
      out.push({
        id: `${p.id}-gb-start`,
        title: p.title,
        slug: p.slug,
        type: "gb_start",
        date: p.gbStartDate.toISOString(),
        status: p.status,
        hero_image_url: p.heroImage,
        category: p.category,
      });
    }
    if (p.gbEndDate) {
      out.push({
        id: `${p.id}-gb-end`,
        title: p.title,
        slug: p.slug,
        type: "gb_end",
        date: p.gbEndDate.toISOString(),
        status: p.status,
        hero_image_url: p.heroImage,
        category: p.category,
      });
    }

    return out;
  });

  const deliveriesMap = new Map<string, typeof deliveryProjects>();
  for (const p of deliveryProjects) {
    const text = p.estimatedDelivery?.trim();
    if (!text) continue;
    const quarterMatch = text.match(/Q([1-4])\s*(20\d{2})/i);
    if (!quarterMatch) continue;
    const quarter = `Q${quarterMatch[1]} ${quarterMatch[2]}`;
    const list = deliveriesMap.get(quarter) ?? [];
    list.push(p);
    deliveriesMap.set(quarter, list);
  }

  const deliveries = [...deliveriesMap.entries()].map(([quarter, projs]) => ({
    quarter,
    projects: projs.map((p) => ({
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
      updated_at: p.createdAt,
    })),
  }));

  return NextResponse.json({ events, deliveries, month, year });
}
