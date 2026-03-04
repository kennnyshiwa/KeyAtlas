import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { rateLimit, RATE_LIMIT_REFERENCE } from "@/lib/rate-limit";

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

  const limited = await rateLimit(user.id, "v1:admin:dashboard", RATE_LIMIT_REFERENCE);
  if (limited) return limited;

  const [totalProjects, publishedProjects, totalUsers, totalReports, statusBreakdown] =
    await Promise.all([
      prisma.project.count(),
      prisma.project.count({ where: { published: true } }),
      prisma.user.count(),
      prisma.projectReport.count({ where: { status: "OPEN" } }),
      prisma.project.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
    ]);

  return NextResponse.json({
    data: {
      totalProjects,
      publishedProjects,
      draftProjects: totalProjects - publishedProjects,
      totalUsers,
      openReports: totalReports,
      statusBreakdown: statusBreakdown.map((s) => ({
        status: s.status,
        count: s._count._all,
      })),
    },
  });
}
