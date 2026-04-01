import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { projectFormSchema } from "@/lib/validations/project";
import { indexProject } from "@/lib/meilisearch";
import { slugify } from "@/lib/slug";
import { notifyWatchlistMatches } from "@/lib/notifications/watchlist";
import type { ProjectCategory, ProjectStatus } from "@/generated/prisma/client";
import { REQUIRE_PROJECT_REVIEW } from "@/lib/feature-flags";
import { rateLimit, RATE_LIMIT_PROJECT_CREATE } from "@/lib/rate-limit";

async function findOrCreateVendorByEntry(entry: {
  vendorId: string;
  customVendorName?: string | null;
  customVendorWebsite?: string | null;
}) {
  if (entry.vendorId && entry.vendorId !== "__new__") return entry.vendorId;

  const rawName = entry.customVendorName?.trim();
  if (!rawName) return null;

  const existing = await prisma.vendor.findFirst({
    where: { name: { equals: rawName, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) return existing.id;

  const baseSlug = slugify(rawName) || "vendor";
  let slug = baseSlug;
  let i = 1;
  while (await prisma.vendor.findUnique({ where: { slug }, select: { id: true } })) {
    slug = `${baseSlug}-${i++}`;
  }

  const created = await prisma.vendor.create({
    data: {
      name: rawName,
      slug,
      storefrontUrl: entry.customVendorWebsite || null,
      verified: false,
      regionsServed: [],
    },
    select: { id: true },
  });

  return created.id;
}


export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const page = Number(searchParams.get("page") ?? "1");
  const limit = Math.min(Number(searchParams.get("limit") ?? "12"), 50);
  const category = searchParams.get("category") as ProjectCategory | null;
  const status = searchParams.get("status") as ProjectStatus | null;
  const featured = searchParams.get("featured");
  const sort = searchParams.get("sort");
  const offset = (page - 1) * limit;

  const where = {
    published: true,
    ...(category && { category }),
    ...(status && { status }),
    ...(featured === "true" && { featured: true }),
  };

  // Build orderBy from sort param
  type OrderBy = Record<string, "asc" | "desc">;
  let orderBy: OrderBy | OrderBy[];
  switch (sort) {
    case "oldest":
      orderBy = { createdAt: "asc" };
      break;
    case "a-z":
      orderBy = { title: "asc" };
      break;
    case "z-a":
      orderBy = { title: "desc" };
      break;
    case "updated":
      orderBy = { updatedAt: "desc" };
      break;
    case "gb-newest":
      orderBy = [{ gbStartDate: "desc" }, { createdAt: "desc" }];
      break;
    case "gb-oldest":
      orderBy = [{ gbStartDate: "asc" }, { createdAt: "asc" }];
      break;
    case "gb-ending":
      orderBy = [{ gbEndDate: "asc" }, { createdAt: "desc" }];
      break;
    default:
      orderBy = { createdAt: "desc" };
  }

  // For GB sorts, only show projects with GB dates
  if (sort === "gb-newest" || sort === "gb-oldest") {
    Object.assign(where, { gbStartDate: { not: null } });
  }
  if (sort === "gb-ending") {
    Object.assign(where, { gbEndDate: { not: null, gte: new Date() } });
  }

  const [projects, total] = await Promise.all([
    prisma.project.findMany({
      where,
      include: {
        vendor: { select: { name: true, slug: true } },
      },
      orderBy,
      skip: offset,
      take: limit,
    }),
    prisma.project.count({ where }),
  ]);

  return NextResponse.json({
    projects,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const intent = searchParams.get("intent");

  // Rate limit only publish actions — skip for draft autosaves
  const isAdminUser = session.user.role === "ADMIN";
  if (intent === "publish") {
    const rateLimited = await rateLimit(session.user.id, "project:create", RATE_LIMIT_PROJECT_CREATE, { skipIfAdmin: isAdminUser });
    if (rateLimited) return rateLimited;
  }
  const body = await req.json();
  const result = projectFormSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: result.error.issues },
      { status: 400 }
    );
  }

  const { images, links, soundTests, projectVendors, ...data } = result.data;

  // Vendor required for GROUP_BUY status — only enforce on publish, not drafts
  if (intent !== "draft" && data.status === "GROUP_BUY" && projectVendors.length === 0) {
    return NextResponse.json(
      { error: "At least one vendor is required for Group Buy projects." },
      { status: 400 }
    );
  }

  // Normalize slug to URL-safe ASCII to prevent 404s from Unicode slugs
  data.slug = slugify(data.slug) || slugify(data.title) || `project-${Date.now()}`;

  // Non-admin users cannot feature projects.
  // When REQUIRE_PROJECT_REVIEW is off, non-admin projects are auto-published.
  const isAdmin = session.user.role === "ADMIN";
  if (!isAdmin) {
    data.featured = false;
    data.published = REQUIRE_PROJECT_REVIEW ? false : true;
  }

  // Optional explicit intent for draft/review/publish/preview while keeping legacy payload compatibility
  if (intent === "draft") {
    data.published = false;
  }
  if (intent === "review") {
    // When review is disabled, treat review intent as publish for everyone.
    data.published = REQUIRE_PROJECT_REVIEW ? false : true;
  }
  if (intent === "publish" && isAdmin) {
    data.published = true;
  }
  // intent=preview preserves payload published state (admins) while still saving latest edits.

  const existing = await prisma.project.findUnique({
    where: { slug: data.slug },
  });
  if (existing) {
    return NextResponse.json(
      { error: "A project with this slug already exists" },
      { status: 409 }
    );
  }

  const resolvedVendors = (
    await Promise.all(
      projectVendors.map(async (pv) => ({
        ...pv,
        vendorId: await findOrCreateVendorByEntry({
          vendorId: pv.vendorId,
          customVendorName: pv.customVendorName,
          customVendorWebsite: pv.customVendorWebsite,
        }),
      }))
    )
  ).filter((pv) => !!pv.vendorId) as Array<{
    vendorId: string;
    region?: string;
    storeLink?: string;
    endDate?: Date | null;
  }>;

  // Auto-set vendorId from first projectVendor for backward compat
  const primaryVendorId = resolvedVendors.length > 0 ? resolvedVendors[0].vendorId : null;

  // Deduplicate gallery images by URL
  const seenUrls = new Set<string>();
  const uniqueImages = images.filter((img: { url: string }) => {
    if (seenUrls.has(img.url)) return false;
    seenUrls.add(img.url);
    return true;
  });

  const project = await prisma.project.create({
    data: {
      ...data,
      vendorId: primaryVendorId,
      creatorId: session.user.id,
      images: {
        create: uniqueImages,
      },
      links: {
        create: links,
      },
      projectVendors: {
        create: resolvedVendors.map((pv) => ({
          vendorId: pv.vendorId,
          region: pv.region || null,
          storeLink: pv.storeLink || null,
          endDate: pv.endDate ?? null,
        })),
      },
      soundTests: {
        create: soundTests.map((st) => ({
          url: st.url,
          title: st.title ?? null,
          platform: st.platform ?? null,
        })),
      },
    },
    include: {
      images: true,
      links: true,
      soundTests: true,
      vendor: { select: { name: true, slug: true } },
      projectVendors: { include: { vendor: { select: { name: true, slug: true } } } },
    },
  });

  // Only index published projects in Meilisearch
  if (project.published) {
    await indexProject(project);

    // Fire-and-forget watchlist notifications
    notifyWatchlistMatches({
      id: project.id,
      title: data.title,
      slug: project.slug,
      category: data.category,
      status: data.status,
      profile: data.profile ?? null,
      designer: data.designer ?? null,
      vendorId: primaryVendorId,
      shipped: data.shipped ?? false,
      tags: data.tags ?? [],
      creatorId: session.user.id,
    }).catch((err) => console.error("Watchlist notification error:", err));
  }

  return NextResponse.json(project, { status: 201 });
}
