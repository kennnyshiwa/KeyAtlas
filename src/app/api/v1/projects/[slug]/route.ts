import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { rateLimit, RATE_LIMIT_DETAIL } from "@/lib/rate-limit";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const user = await authenticateApiKey(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = await rateLimit(user.id, "v1:projects:detail", RATE_LIMIT_DETAIL);
  if (limited) return limited;

  const { slug } = await params;

  const project = await prisma.project.findUnique({
    where: { slug, published: true },
    include: {
      images: {
        select: { id: true, url: true, alt: true, order: true, linkUrl: true, openInNewTab: true },
        orderBy: { order: "asc" },
      },
      links: { select: { id: true, label: true, url: true, type: true } },
      projectVendors: {
        include: { vendor: { select: { name: true } } },
      },
      _count: { select: { favorites: true } },
    },
  });

  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const data = {
    id: project.id,
    title: project.title,
    slug: project.slug,
    description: project.description,
    category: project.category,
    status: project.status,
    priceMin: project.priceMin,
    priceMax: project.priceMax,
    currency: project.currency,
    heroImage: project.heroImage,
    heroTextAlign: project.heroTextAlign,
    heroSize: project.heroSize,
    heroBgColor: project.heroBgColor,
    heroTextColor: project.heroTextColor,
    profile: project.profile,
    shipped: project.shipped,
    tags: project.tags,
    icDate: project.icDate,
    gbStartDate: project.gbStartDate,
    gbEndDate: project.gbEndDate,
    estimatedDelivery: project.estimatedDelivery,
    createdAt: project.createdAt,
    images: project.images,
    links: project.links,
    designer: project.designer,
    vendors: project.projectVendors.map((pv) => ({
      name: pv.vendor.name,
      region: pv.region,
      storeLink: pv.storeLink,
      endDate: pv.endDate,
    })),
    favoriteCount: project._count.favorites,
  };

  return NextResponse.json({ data });
}
