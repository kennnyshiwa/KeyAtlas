import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

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
  const limit = Math.min(Math.max(1, Number(searchParams.get("limit") ?? "25") || 25), 5000);

  const where = q
    ? {
        OR: [
          { name: { contains: q, mode: "insensitive" as const } },
          { slug: { contains: q, mode: "insensitive" as const } },
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
        ],
      }
    : {};

  const [total, designers] = await prisma.$transaction([
    prisma.designer.count({ where }),
    prisma.designer.findMany({
      where,
      select: {
        id: true,
        name: true,
        slug: true,
        _count: { select: { projects: true } },
      },
      orderBy: { name: "asc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return NextResponse.json({
    data: designers,
    total,
    page,
    limit,
    hasMore: page * limit < total,
  });
}
