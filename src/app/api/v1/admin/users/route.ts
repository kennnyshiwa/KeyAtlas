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

  const limited = await rateLimit(user.id, "v1:admin:users", RATE_LIMIT_LIST);
  if (limited) return limited;

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const limit = Math.min(Math.max(1, Number(searchParams.get("limit") ?? "20")), 50);
  const offset = (page - 1) * limit;

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        bannedAt: true,
        banReason: true,
        image: true,
        createdAt: true,
        lastSeenAt: true,
        _count: { select: { projects: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: offset,
      take: limit,
    }),
    prisma.user.count(),
  ]);

  return NextResponse.json({
    data: users.map((u) => ({
      id: u.id,
      username: u.username,
      email: u.email,
      role: u.role,
      bannedAt: u.bannedAt,
      banReason: u.banReason,
      image: u.image,
      createdAt: u.createdAt,
      lastSeenAt: u.lastSeenAt,
      projectCount: u._count.projects,
    })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}
