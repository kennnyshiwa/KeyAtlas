import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { indexProject, removeProjectFromIndex } from "@/lib/meilisearch";
import { notifyWatchlistMatches } from "@/lib/notifications/watchlist";
import { prisma } from "@/lib/prisma";
import { rateLimit, RATE_LIMIT_DETAIL, RATE_LIMIT_PROJECT_UPDATE } from "@/lib/rate-limit";
import type { ProjectCategory, ProjectStatus } from "@/generated/prisma/client";
import { isProjectStatus } from "@/lib/constants";

type EditableProjectLinkType = "GEEKHACK" | "WEBSITE" | "DISCORD" | "INSTAGRAM" | "REDDIT" | "STORE" | "OTHER";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const user = await authenticateApiKey(req).catch(() => null);
  const rateLimitKey = user?.id ?? (req.headers.get("x-forwarded-for") ?? "anon");
  const limited = await rateLimit(rateLimitKey, "v1:projects:detail", RATE_LIMIT_DETAIL);
  if (limited) return limited;

  const { slug } = await params;
  const decodedSlug = (() => {
    try {
      return decodeURIComponent(slug);
    } catch {
      return slug;
    }
  })();
  const slugCandidates = Array.from(
    new Set([
      slug,
      decodedSlug,
      decodedSlug.normalize("NFC"),
      decodedSlug.normalize("NFD"),
    ])
  );

  const project = await prisma.project.findFirst({
    where: { slug: { in: slugCandidates }, published: true },
    include: {
      images: {
        select: { id: true, url: true, alt: true, order: true, linkUrl: true, openInNewTab: true },
        orderBy: { order: "asc" },
      },
      links: { select: { id: true, label: true, url: true, type: true } },
      soundTests: { select: { id: true, title: true, url: true, platform: true } },
      updates: {
        select: { id: true, title: true, content: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      },
      comments: {
        where: { parentId: null },
        select: {
          id: true,
          content: true,
          createdAt: true,
          updatedAt: true,
          user: { select: { id: true, username: true, name: true, displayName: true, image: true } },
          replies: {
            select: {
              id: true,
              content: true,
              createdAt: true,
              updatedAt: true,
              user: { select: { id: true, username: true, name: true, displayName: true, image: true } },
            },
            orderBy: { createdAt: "asc" },
          },
        },
        orderBy: { createdAt: "desc" },
      },
      creator: { select: { id: true, username: true, name: true, displayName: true, image: true } },
      designerProfile: { select: { name: true, slug: true } },
      projectVendors: {
        include: { vendor: { select: { name: true } } },
      },
      _count: { select: { favorites: true } },
    },
  });

  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [followCount, isFollowing, isFavorited, isInCollection] = await Promise.all([
    prisma.follow.count({ where: { targetType: "PROJECT", targetId: project.id } }),
    user
      ? prisma.follow
          .findUnique({
            where: {
              userId_targetType_targetId: {
                userId: user.id,
                targetType: "PROJECT",
                targetId: project.id,
              },
            },
          })
          .then((f) => !!f)
      : Promise.resolve(false),
    user
      ? prisma.favorite
          .findUnique({ where: { userId_projectId: { userId: user.id, projectId: project.id } } })
          .then((f) => !!f)
      : Promise.resolve(false),
    user
      ? prisma.userCollection
          .findUnique({ where: { userId_projectId: { userId: user.id, projectId: project.id } } })
          .then((c) => !!c)
      : Promise.resolve(false),
  ]);

  const data = {
    id: project.id,
    title: project.title,
    slug: project.slug,
    description: project.description,
    status: project.status,
    hero_image_url: project.heroImage,
    category: project.category,
    category_id: project.category,
    profile: project.profile,
    designer: {
      id: project.creator.id,
      username: project.creator.username,
      name: project.creator.name,
      displayName: project.creator.displayName,
      avatar_url: project.creator.image,
      image: project.creator.image,
      role: "USER",
    },
    designer_profile: project.designerProfile
      ? { name: project.designerProfile.name, slug: project.designerProfile.slug }
      : null,
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
    sound_tests: project.soundTests.map((st) => ({
      id: st.id,
      title: st.title,
      url: st.url,
      platform: st.platform,
    })),
    updates: project.updates.map((u) => ({
      id: u.id,
      title: u.title,
      content: u.content,
      created_at: u.createdAt,
    })),
    comments: project.comments.map((c) => ({
      id: c.id,
      content: c.content,
      created_at: c.createdAt,
      updated_at: c.updatedAt,
      author: {
        id: c.user.id,
        username: c.user.username,
        name: c.user.displayName ?? c.user.name,
        avatar_url: c.user.image,
        image: c.user.image,
      },
      replies: c.replies.map((r) => ({
        id: r.id,
        content: r.content,
        created_at: r.createdAt,
        updated_at: r.updatedAt,
        author: {
          id: r.user.id,
          username: r.user.username,
          name: r.user.displayName ?? r.user.name,
          avatar_url: r.user.image,
          image: r.user.image,
        },
      })),
    })),
    tags: project.tags ?? [],
    links: project.links.map((link) => ({
      id: link.id,
      title: link.label,
      url: link.url,
    })),
    estimated_delivery: project.estimatedDelivery,
    gb_start_date: project.gbStartDate,
    gb_end_date: project.gbEndDate,
    follow_count: followCount,
    favorite_count: project._count.favorites,
    is_following: isFollowing,
    is_favorited: isFavorited,
    is_in_collection: isInCollection,
    is_featured: project.featured,
    published: project.published,
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
  const decodedSlug = (() => {
    try {
      return decodeURIComponent(slug);
    } catch {
      return slug;
    }
  })();
  const slugCandidates = Array.from(
    new Set([
      slug,
      decodedSlug,
      decodedSlug.normalize("NFC"),
      decodedSlug.normalize("NFD"),
    ])
  );
  const existing = await prisma.project.findFirst({
    where: { slug: { in: slugCandidates } },
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
  if (body.status !== undefined && !isProjectStatus(body.status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const normalizeLinkType = (value: unknown): EditableProjectLinkType => {
    switch (value) {
      case "GEEKHACK":
      case "WEBSITE":
      case "DISCORD":
      case "INSTAGRAM":
      case "REDDIT":
      case "STORE":
      case "OTHER":
        return value;
      default:
        return "OTHER";
    }
  };

  const normalizedLinks = Array.isArray(body.links)
    ? body.links
        .map((link: unknown) => {
          const item = typeof link === "object" && link !== null ? (link as Record<string, unknown>) : {};
          const url = typeof item.url === "string" ? item.url.trim() : "";
          const labelSource = typeof item.label === "string"
            ? item.label
            : typeof item.title === "string"
              ? item.title
              : "";
          const label = labelSource.trim();
          if (!url) return null;
          return {
            label: label || "Link",
            url,
            type: normalizeLinkType(item.type),
          };
        })
        .filter((link: { label: string; url: string; type: EditableProjectLinkType } | null): link is { label: string; url: string; type: EditableProjectLinkType } => !!link)
    : null;

  const normalizedProjectVendors = Array.isArray(body.project_vendors)
    ? body.project_vendors
        .map((vendor: unknown) => {
          const item = typeof vendor === "object" && vendor !== null ? (vendor as Record<string, unknown>) : {};
          const vendorId = typeof item.vendorId === "string" ? item.vendorId.trim() : "";
          if (!vendorId) return null;
          const region = typeof item.region === "string" ? item.region.trim() : "";
          const storeLink = typeof item.storeLink === "string" ? item.storeLink.trim() : "";
          return {
            vendorId,
            region,
            storeLink,
          };
        })
        .filter((vendor: { vendorId: string; region: string; storeLink: string } | null): vendor is { vendorId: string; region: string; storeLink: string } => !!vendor)
    : null;

  const previous = await prisma.project.findUnique({
    where: { id: existing.id },
    select: {
      published: true,
      category: true,
      status: true,
      profile: true,
      designer: true,
      vendorId: true,
      tags: true,
      creatorId: true,
    },
  });

  const updated = await prisma.$transaction(async (tx) => {
    if (normalizedLinks !== null) {
      await tx.projectLink.deleteMany({ where: { projectId: existing.id } });
    }
    if (normalizedProjectVendors !== null) {
      await tx.projectVendor.deleteMany({ where: { projectId: existing.id } });
    }

    return tx.project.update({
      where: { id: existing.id },
      data: {
        title: body.title,
        description: body.description ?? null,
        status: body.status as ProjectStatus | undefined,
        category: (body.category_id as ProjectCategory) ?? undefined,
        heroImage: body.hero_image_url ?? undefined,
        estimatedDelivery: body.estimated_delivery ?? null,
        priceMin: typeof body.min_price === "number" ? body.min_price : null,
        priceMax: typeof body.max_price === "number" ? body.max_price : null,
        gbStartDate: body.gb_start_date ? new Date(body.gb_start_date) : null,
        gbEndDate: body.gb_end_date ? new Date(body.gb_end_date) : null,
        profile: body.profile !== undefined ? (body.profile || null) : undefined,
        tags: Array.isArray(body.tags)
          ? body.tags.filter((tag: unknown): tag is string => typeof tag === "string").map((tag: string) => tag.trim()).filter(Boolean)
          : undefined,
        ...(isAdmin && typeof body.featured === "boolean" ? { featured: body.featured } : {}),
        ...(isAdmin && typeof body.published === "boolean" ? { published: body.published } : {}),
        ...(normalizedProjectVendors !== null
          ? {
              vendorId: normalizedProjectVendors[0]?.vendorId ?? null,
              projectVendors: {
                create: normalizedProjectVendors.map((vendor: { vendorId: string; region: string; storeLink: string }) => ({
                  vendorId: vendor.vendorId,
                  region: vendor.region || null,
                  storeLink: vendor.storeLink || null,
                })),
              },
            }
          : {}),
        ...(normalizedLinks !== null
          ? {
              links: {
                create: normalizedLinks,
              },
            }
          : {}),
      },
      include: {
        vendor: { select: { name: true, slug: true } },
      },
    });
  });

  if (updated.published) {
    await indexProject(updated);

    if (!previous?.published) {
      await notifyWatchlistMatches({
        id: updated.id,
        title: updated.title,
        slug: updated.slug,
        category: updated.category,
        status: updated.status,
        profile: updated.profile,
        designer: updated.designer,
        vendorId: updated.vendorId,
        tags: updated.tags,
        creatorId: updated.creatorId,
      });
    }
  } else if (previous?.published) {
    await removeProjectFromIndex(updated.id);
  }

  return NextResponse.json({ data: updated });
}
