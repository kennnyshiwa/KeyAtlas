import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { rateLimit, RATE_LIMIT_LIST } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  const user = await authenticateApiKey(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { role: true },
  });
  if (dbUser?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const limited = await rateLimit(user.id, "v1:admin:projects", RATE_LIMIT_LIST);
  if (limited) return limited;

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const limit = Math.min(Math.max(1, Number(searchParams.get("limit") ?? "20")), 50);
  const offset = (page - 1) * limit;

  const [projects, total] = await Promise.all([
    prisma.project.findMany({
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        published: true,
        heroImage: true,
        createdAt: true,
        updatedAt: true,
        creator: { select: { id: true, username: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: offset,
      take: limit,
    }),
    prisma.project.count(),
  ]);

  return NextResponse.json({
    data: projects.map((p) => ({
      id: p.id,
      title: p.title,
      slug: p.slug,
      status: p.status,
      published: p.published,
      heroImage: p.heroImage,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      creator: p.creator,
    })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}
