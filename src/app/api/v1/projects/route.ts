import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { rateLimit, RATE_LIMIT_LIST } from "@/lib/rate-limit";
import type { ProjectCategory, ProjectStatus } from "@/generated/prisma/client";

export async function GET(req: NextRequest) {
  const user = await authenticateApiKey(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = rateLimit(user.id, "v1:projects", RATE_LIMIT_LIST);
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
    ...p,
    vendorName: p.vendor?.name ?? null,
    vendor: undefined,
  }));

  return NextResponse.json({
    data,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}
