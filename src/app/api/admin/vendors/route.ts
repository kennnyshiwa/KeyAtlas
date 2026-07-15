import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/admin-auth";
import { sortByNameCaseInsensitive } from "@/lib/sort-by-name";

export async function GET(req: NextRequest) {
  const access = await requireAdminSession({ allowModeratorReadOnly: true });
  if (!access.ok) {
    return NextResponse.json(
      { error: access.error, message: access.message },
      { status: access.status }
    );
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
  const limit = Math.min(Math.max(1, Number(searchParams.get("limit") ?? "25") || 25), 100);

  const where = q
    ? {
        OR: [
          { name: { contains: q, mode: "insensitive" as const } },
          { slug: { contains: q, mode: "insensitive" as const } },
          { storefrontUrl: { contains: q, mode: "insensitive" as const } },
          {
            projects: {
              some: {
                OR: [
                  { title: { contains: q, mode: "insensitive" as const } },
                  { slug: { contains: q, mode: "insensitive" as const } },
                ],
              },
            },
          },
          {
            projectVendors: {
              some: {
                project: {
                  OR: [
                    { title: { contains: q, mode: "insensitive" as const } },
                    { slug: { contains: q, mode: "insensitive" as const } },
                  ],
                },
              },
            },
          },
        ],
      }
    : {};

  const [total, vendorsRaw] = await prisma.$transaction([
    prisma.vendor.count({ where }),
    prisma.vendor.findMany({
      where,
      select: {
        id: true,
        name: true,
        slug: true,
        regionsServed: true,
        verified: true,
        _count: { select: { projects: true, projectVendors: true } },
      },
      orderBy: { name: "asc" },
    }),
  ]);
  const vendors = sortByNameCaseInsensitive(vendorsRaw).slice((page - 1) * limit, page * limit);

  return NextResponse.json({
    data: vendors,
    total,
    page,
    limit,
    hasMore: page * limit < total,
  });
}
