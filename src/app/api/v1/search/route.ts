import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { rateLimit, RATE_LIMIT_LIST } from "@/lib/rate-limit";

let searchProjects: typeof import("@/lib/meilisearch").searchProjects | null = null;
try {
  // Dynamic import so the endpoint still works if Meilisearch is not configured
  const mod = require("@/lib/meilisearch");
  searchProjects = mod.searchProjects;
} catch {
  // Meilisearch unavailable — will fallback to Prisma
}

export async function GET(req: NextRequest) {
  const user = await authenticateApiKey(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = await rateLimit(user.id, "v1:search", RATE_LIMIT_LIST);
  if (limited) return limited;

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? "";
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const limit = Math.min(Math.max(1, Number(searchParams.get("limit") ?? "20")), 50);

  if (!q.trim()) {
    return NextResponse.json({ data: [], pagination: { page, limit, total: 0, totalPages: 0 } });
  }

  // Try Meilisearch first
  if (searchProjects) {
    try {
      const offset = (page - 1) * limit;
      const results = await searchProjects(q, {
        filter: "published = true",
        sort: ["createdAt:desc"],
        limit,
        offset,
      });
      return NextResponse.json({
        data: results.hits,
        pagination: {
          page,
          limit,
          total: results.estimatedTotalHits ?? results.hits.length,
          totalPages: Math.ceil((results.estimatedTotalHits ?? results.hits.length) / limit),
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

  const [projects, total] = await Promise.all([
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
  ]);

  return NextResponse.json({
    data: projects,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}
