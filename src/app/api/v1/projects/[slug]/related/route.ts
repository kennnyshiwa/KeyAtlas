import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { projectSlugWhere } from "@/lib/project-slug-aliases";
import { normalizeProjectProfiles } from "@/lib/project-profiles";
import { rateLimit, RATE_LIMIT_LIST } from "@/lib/rate-limit";

/** Public recommendation cards; the shipped iOS caller does not send credentials. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const limited = await rateLimit(
    req.headers.get("x-forwarded-for") ?? "anon",
    "v1:projects:related",
    RATE_LIMIT_LIST,
  );
  if (limited) return limited;

  const { slug } = await params;
  const project = await prisma.project.findFirst({
    where: { ...projectSlugWhere(slug), published: true },
    select: { id: true, vendorId: true, category: true },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Match the related rail in app/projects/[slug]/page.tsx. A missing vendor
  // must not relate every vendor-less project across unrelated categories.
  const projects = await prisma.project.findMany({
    where: {
      published: true,
      id: { not: project.id },
      OR: [
        ...(project.vendorId ? [{ vendorId: project.vendorId }] : []),
        { category: project.category },
      ],
    },
    orderBy: [{ featured: "desc" }, { updatedAt: "desc" }],
    take: 4,
    select: {
      id: true, title: true, slug: true, description: true,
      status: true, category: true, heroImage: true,
      profile: true, profiles: true, tags: true,
      priceMin: true, priceMax: true, currency: true,
      estimatedDelivery: true, gbStartDate: true, gbEndDate: true,
      featured: true, published: true, createdAt: true, updatedAt: true,
      creator: { select: { id: true, username: true, name: true, displayName: true, image: true } },
      designerProfile: { select: { name: true, slug: true } },
      images: {
        select: { id: true, url: true, alt: true, order: true },
        orderBy: { order: "asc" },
      },
      projectVendors: {
        select: {
          vendorId: true, storeLink: true, region: true,
          vendor: { select: { name: true, slug: true, logo: true } },
        },
        orderBy: { sortOrder: "asc" },
      },
      _count: { select: { favorites: true, comments: true } },
    },
  });

  // Follow is polymorphic: legacy rows may not have targetProjectId set.
  // Use the list/detail targetType + targetId contract, not _count.followers.
  const followCounts = projects.length
    ? await prisma.follow.groupBy({
        by: ["targetId"],
        where: { targetType: "PROJECT", targetId: { in: projects.map((p) => p.id) } },
        _count: true,
      })
    : [];
  const followMap = new Map(followCounts.map((f) => [f.targetId, f._count]));

  return NextResponse.json({
    data: projects.map((p) => ({
      id: p.id,
      title: p.title,
      slug: p.slug,
      description: p.description,
      status: p.status,
      hero_image_url: p.heroImage,
      category: p.category,
      category_id: p.category,
      profile: p.profile,
      profiles: normalizeProjectProfiles(p.profiles, p.profile),
      // Keep the detail API's creator/designer-profile representation.
      designer: {
        id: p.creator.id,
        username: p.creator.username,
        name: p.creator.name,
        displayName: p.creator.displayName,
        avatar_url: p.creator.image,
        image: p.creator.image,
        role: "USER",
      },
      designer_profile: p.designerProfile,
      pricing: { min_price: p.priceMin, max_price: p.priceMax, currency: p.currency },
      vendors: p.projectVendors.map((pv) => ({
        id: `${p.id}-${pv.vendorId}`,
        vendor: { id: pv.vendorId, name: pv.vendor.name, slug: pv.vendor.slug, logo_url: pv.vendor.logo },
        url: pv.storeLink,
        region: pv.region,
      })),
      gallery: p.images.map((img) => ({ id: img.id, url: img.url, caption: img.alt, position: img.order })),
      tags: p.tags,
      estimated_delivery: p.estimatedDelivery,
      gb_start_date: p.gbStartDate,
      gb_end_date: p.gbEndDate,
      follow_count: followMap.get(p.id) ?? 0,
      favorite_count: p._count.favorites,
      comment_count: p._count.comments,
      is_following: false,
      is_favorited: false,
      is_in_collection: false,
      is_featured: p.featured,
      published: p.published,
      created_at: p.createdAt,
      updated_at: p.updatedAt,
    })),
  });
}
