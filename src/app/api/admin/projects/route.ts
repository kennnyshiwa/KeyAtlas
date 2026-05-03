import { NextRequest, NextResponse } from "next/server";
import { ProjectStatus } from "@/generated/prisma/client";
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
  const rawStatus = searchParams.get("status");
  const status = rawStatus && Object.values(ProjectStatus).includes(rawStatus as ProjectStatus)
    ? (rawStatus as ProjectStatus)
    : undefined;
  const published =
    searchParams.get("published") === "live" || searchParams.get("published") === "draft"
      ? searchParams.get("published")
      : undefined;
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
  const limit = Math.min(Math.max(1, Number(searchParams.get("limit") ?? "25") || 25), 100);

  const where = {
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" as const } },
            { slug: { contains: q, mode: "insensitive" as const } },
            {
              vendor: {
                is: { name: { contains: q, mode: "insensitive" as const } },
              },
            },
            {
              projectVendors: {
                some: {
                  vendor: { name: { contains: q, mode: "insensitive" as const } },
                },
              },
            },
            { designer: { contains: q, mode: "insensitive" as const } },
            {
              designerProfile: {
                is: { name: { contains: q, mode: "insensitive" as const } },
              },
            },
          ],
        }
      : {}),
    ...(status ? { status } : {}),
    ...(published === "live" ? { published: true } : {}),
    ...(published === "draft" ? { published: false } : {}),
  };

  const [total, projects] = await prisma.$transaction([
    prisma.project.count({ where }),
    prisma.project.findMany({
      where,
      select: {
        id: true,
        title: true,
        slug: true,
        category: true,
        status: true,
        published: true,
        createdAt: true,
        vendor: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return NextResponse.json({
    data: projects,
    total,
    page,
    limit,
    hasMore: page * limit < total,
  });
}
