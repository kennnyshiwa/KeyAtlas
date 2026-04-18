import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { rateLimit, RATE_LIMIT_LIST } from "@/lib/rate-limit";

let searchProjects: typeof import("@/lib/meilisearch").searchProjects | null = null;
try {
  const mod = require("@/lib/meilisearch");
  searchProjects = mod.searchProjects;
} catch {
  // Meilisearch unavailable — will fallback to Prisma
}

async function filterToLiveProjectHits<T>(hits: T[]): Promise<T[]> {
  if (hits.length === 0) return hits;

  const getId = (hit: T) => {
    const id = (hit as { id?: unknown }).id;
    return typeof id === "string" ? id : null;
  };

  const ids = hits.map(getId).filter((id): id is string => Boolean(id));
  if (ids.length === 0) return [];

  const liveProjects = await prisma.project.findMany({
    where: {
      id: { in: ids },
      published: true,
    },
    select: { id: true },
  });

  const liveIds = new Set(liveProjects.map((project) => project.id));
  return hits.filter((hit) => {
    const id = getId(hit);
    return id !== null && liveIds.has(id);
  });
}

export async function GET(req: NextRequest) {
  const user = await authenticateApiKey(req).catch(() => null);
  const rateLimitKey = user?.id ?? (req.headers.get("x-forwarded-for") ?? "anon");
  const limited = await rateLimit(rateLimitKey, "v1:search", RATE_LIMIT_LIST);
  if (limited) return limited;

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? "";
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const limit = Math.min(Math.max(1, Number(searchParams.get("limit") ?? "20")), 50);

  if (!q.trim()) {
    return NextResponse.json({
      data: [],
      vendors: [],
      designers: [],
      pagination: { page, limit, total: 0, totalPages: 0 },
    });
  }

  // Search vendors and designers in parallel with projects
  const vendorPromise = prisma.vendor.findMany({
    where: {
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { slug: { contains: q, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      name: true,
      slug: true,
      logo: true,
      description: true,
      storefrontUrl: true,
      verified: true,
      regionsServed: true,
      _count: { select: { projectVendors: true } },
    },
    orderBy: { name: "asc" },
    take: 10,
  });

  const designerPromise = prisma.designer.findMany({
    where: {
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { slug: { contains: q, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      name: true,
      slug: true,
      logo: true,
      banner: true,
      description: true,
      websiteUrl: true,
      _count: { select: { projects: true } },
    },
    orderBy: { name: "asc" },
    take: 10,
  });

  // Try Meilisearch first for projects
  if (searchProjects) {
    try {
      const offset = (page - 1) * limit;
      const [results, vendors, designers] = await Promise.all([
        searchProjects(q, {
          filter: "published = true",
          sort: ["createdAt:desc"],
          limit,
          offset,
        }),
        vendorPromise,
        designerPromise,
      ]);

      const projectHits = await filterToLiveProjectHits(results.hits);

      return NextResponse.json({
        data: projectHits,
        vendors: vendors.map((v) => ({
          id: v.id,
          name: v.name,
          slug: v.slug,
          description: v.description,
          logo_url: v.logo,
          website_url: v.storefrontUrl,
          regions: v.regionsServed,
          verified: v.verified,
          project_count: v._count.projectVendors,
        })),
        designers: designers.map((d) => ({
          id: d.id,
          name: d.name,
          slug: d.slug,
          description: d.description,
          logo_url: d.logo,
          banner_url: d.banner,
          website_url: d.websiteUrl,
          project_count: d._count.projects,
        })),
        pagination: {
          page,
          limit,
          total: projectHits.length,
          totalPages: Math.ceil(projectHits.length / limit),
        },
      });
    } catch {
      // Fall through to Prisma
    }
  }

  // Prisma fallback
  const offset = (page - 1) * limit;
  const where = {
    published: true,
    title: { contains: q, mode: "insensitive" as const },
  };

  const [projects, total, vendors, designers] = await Promise.all([
    prisma.project.findMany({
      where,
      select: {
        id: true,
        title: true,
        slug: true,
        category: true,
        status: true,
        heroImage: true,
        designer: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      skip: offset,
      take: limit,
    }),
    prisma.project.count({ where }),
    vendorPromise,
    designerPromise,
  ]);

  return NextResponse.json({
    data: projects,
    vendors: vendors.map((v) => ({
      id: v.id,
      name: v.name,
      slug: v.slug,
      description: v.description,
      logo_url: v.logo,
      website_url: v.storefrontUrl,
      regions: v.regionsServed,
      verified: v.verified,
      project_count: v._count.projectVendors,
    })),
    designers: designers.map((d) => ({
      id: d.id,
      name: d.name,
      slug: d.slug,
      description: d.description,
      logo_url: d.logo,
      banner_url: d.banner,
      website_url: d.websiteUrl,
      project_count: d._count.projects,
    })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}
