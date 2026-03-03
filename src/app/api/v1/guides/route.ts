import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { rateLimit, RATE_LIMIT_LIST } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  const user = await authenticateApiKey(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = await rateLimit(user.id, "v1:guides", RATE_LIMIT_LIST);
  if (limited) return limited;

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const limit = Math.min(Math.max(1, Number(searchParams.get("limit") ?? "20")), 50);
  const offset = (page - 1) * limit;

  const [guides, total] = await Promise.all([
    prisma.buildGuide.findMany({
      where: { published: true },
      select: {
        id: true,
        title: true,
        slug: true,
        heroImage: true,
        difficulty: true,
        createdAt: true,
        updatedAt: true,
        author: { select: { id: true, username: true, image: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: offset,
      take: limit,
    }),
    prisma.buildGuide.count({ where: { published: true } }),
  ]);

  return NextResponse.json({
    data: guides,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}
