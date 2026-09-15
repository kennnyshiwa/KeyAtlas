import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { rateLimit, RATE_LIMIT_LIST } from "@/lib/rate-limit";
import type { Prisma, ProjectCategory } from "@/generated/prisma/client";
import { resolveProjectStatusInput } from "@/lib/constants";
import { projectCardSelect, projectCards, privateViewerResponse } from "@/lib/v1-project-cards";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    return await getProjects(req);
  } catch {
    // Never expose database/auth internals or bypass personalized cache policy.
    return privateViewerResponse(NextResponse.json({ error: "Internal server error" }, { status: 500 }));
  }
}

async function getProjects(req: NextRequest) {
  // Public read with optional, page-bounded viewer state
  const user = await authenticateApiKey(req).catch(() => null);

  // Rate-limit by user id if authenticated, otherwise by IP
  const rateLimitKey = user?.id ?? (req.headers.get("x-forwarded-for") ?? "anon");
  const limited = await rateLimit(rateLimitKey, "v1:projects", RATE_LIMIT_LIST);
  if (limited) return privateViewerResponse(limited);

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const requestedLimit = searchParams.get("limit") ?? searchParams.get("page_size") ?? "20";
  const limit = Math.min(Math.max(1, Number(requestedLimit)), 50);
  const category = searchParams.get("category") as ProjectCategory | null;
  const status = resolveProjectStatusInput(searchParams.get("status"));
  const q = searchParams.get("q");
  const profileFilter = (searchParams.get("profile") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const featured = searchParams.get("featured");
  const designer = searchParams.get("designer");
  const offset = (page - 1) * limit;
  const sort = searchParams.get("sort");

  const where = {
    published: true,
    ...(category && { category }),
    ...(status && { status }),
    ...(q && { title: { contains: q, mode: "insensitive" as const } }),
    ...(profileFilter.length > 0 && {
      OR: [
        { profiles: { hasSome: profileFilter } },
        { profile: { in: profileFilter } },
      ],
    }),
    ...(featured === "true" && { featured: true }),
    ...(designer && { designer: { contains: designer, mode: "insensitive" as const } }),
  };

  let orderBy: Prisma.ProjectOrderByWithRelationInput | Prisma.ProjectOrderByWithRelationInput[];
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
    case "recently_updated":
      orderBy = { updatedAt: "desc" };
      break;
    case "gb-newest":
    case "gb_newest":
      orderBy = [{ gbStartDate: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }];
      break;
    case "gb-oldest":
    case "gb_oldest":
      orderBy = [{ gbStartDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }];
      break;
    case "gb-ending":
    case "gb_ending":
      Object.assign(where, { gbEndDate: { not: null, gte: new Date() } });
      orderBy = [{ gbEndDate: "asc" }, { createdAt: "desc" }];
      break;
    case "ic-newest":
    case "ic_newest":
      orderBy = [{ icDate: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }];
      break;
    case "ic-oldest":
    case "ic_oldest":
      orderBy = [{ icDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }];
      break;
    case "most-followed":
    case "most_followed":
      orderBy = { createdAt: "desc" }; // TODO: add follow relation count to sort when available
      break;
    default:
      orderBy = { createdAt: "desc" };
  }

  const [projects, total] = await Promise.all([
    prisma.project.findMany({
      where,
      select: projectCardSelect,
      orderBy,
      skip: offset,
      take: limit,
    }),
    prisma.project.count({ where }),
  ]);

  const data = await projectCards(projects, user?.id);

  return privateViewerResponse(NextResponse.json({
    data,
    total,
    page,
    page_size: limit,
    has_more: page * limit < total,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  }));
}
