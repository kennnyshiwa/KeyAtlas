import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { rateLimit, RATE_LIMIT_DETAIL, RATE_LIMIT_PROJECT_UPDATE } from "@/lib/rate-limit";
import type { ProjectCategory, ProjectStatus } from "@/generated/prisma/client";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const user = await authenticateApiKey(req).catch(() => null);
  const rateLimitKey = user?.id ?? (req.headers.get("x-forwarded-for") ?? "anon");
  const limited = await rateLimit(rateLimitKey, "v1:projects:detail", RATE_LIMIT_DETAIL);
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
      updates: {
        select: { id: true, title: true, content: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      },
      creator: { select: { id: true, username: true, name: true, image: true } },
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
    status: project.status,
    hero_image_url: project.heroImage,
    category: null,
    category_id: null,
    designer: {
      id: project.creator.id,
      username: project.creator.username,
      name: project.creator.name,
      image: project.creator.image,
      role: "USER",
    },
    pricing: {
      min_price: project.priceMin,
      max_price: project.priceMax,
      currency: project.currency,
    },
    vendors: project.projectVendors.map((pv) => ({
      id: `${project.id}-${pv.vendorId}`,
      vendor: {
        id: pv.vendorId,
        name: pv.vendor.name,
        slug: "",
        logo_url: null,
      },
      url: pv.storeLink,
      region: pv.region,
    })),
    gallery: project.images.map((img) => ({
      id: img.id,
      url: img.url,
      caption: img.alt,
      position: img.order,
    })),
    timeline: [],
    updates: project.updates.map((u) => ({
      id: u.id,
      title: u.title,
      content: u.content,
      created_at: u.createdAt,
    })),
    comments: [],
    tags: project.tags ?? [],
    links: project.links.map((link) => ({
      id: link.id,
      title: link.label,
      url: link.url,
    })),
    estimated_delivery: project.estimatedDelivery,
    gb_start_date: project.gbStartDate,
    gb_end_date: project.gbEndDate,
    follow_count: 0,
    favorite_count: project._count.favorites,
    is_following: false,
    is_favorited: false,
    is_featured: false,
    created_at: project.createdAt,
    updated_at: project.updatedAt,
  };

  return NextResponse.json({ data });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const user = await authenticateApiKey(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = await rateLimit(user.id, "v1:projects:update", RATE_LIMIT_PROJECT_UPDATE);
  if (limited) return limited;

  const { slug } = await params;
  const existing = await prisma.project.findUnique({
    where: { slug },
    select: { id: true, creatorId: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { role: true },
  });
  const isAdmin = dbUser?.role === "ADMIN";
  if (!isAdmin && existing.creatorId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();

  const updated = await prisma.project.update({
    where: { id: existing.id },
    data: {
      title: body.title,
      description: body.description ?? null,
      status: (body.status as ProjectStatus) ?? undefined,
      category: (body.category_id as ProjectCategory) ?? undefined,
      heroImage: body.hero_image_url ?? undefined,
      estimatedDelivery: body.estimated_delivery ?? null,
      priceMin: typeof body.min_price === "number" ? body.min_price : null,
      priceMax: typeof body.max_price === "number" ? body.max_price : null,
      gbStartDate: body.gb_start_date ? new Date(body.gb_start_date) : null,
      gbEndDate: body.gb_end_date ? new Date(body.gb_end_date) : null,
    },
    select: { id: true, slug: true, updatedAt: true },
  });

  return NextResponse.json({ data: updated });
}
