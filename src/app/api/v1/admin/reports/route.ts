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

  const limited = await rateLimit(user.id, "v1:admin:reports", RATE_LIMIT_LIST);
  if (limited) return limited;

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const limit = Math.min(Math.max(1, Number(searchParams.get("limit") ?? "20")), 50);
  const offset = (page - 1) * limit;
  const status = searchParams.get("status") ?? "OPEN";

  const where = status === "ALL" ? {} : { status: status as "OPEN" | "RESOLVED" | "NON_ISSUE" };

  const [reports, total] = await Promise.all([
    prisma.projectReport.findMany({
      where,
      select: {
        id: true,
        reason: true,
        status: true,
        createdAt: true,
        resolvedAt: true,
        resolutionNote: true,
        project: { select: { id: true, title: true, slug: true } },
        reporter: { select: { id: true, username: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: offset,
      take: limit,
    }),
    prisma.projectReport.count({ where }),
  ]);

  return NextResponse.json({
    data: reports,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}
