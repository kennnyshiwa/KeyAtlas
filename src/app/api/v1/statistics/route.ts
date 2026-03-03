import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { rateLimit, RATE_LIMIT_REFERENCE } from "@/lib/rate-limit";
import { subMonths, format } from "date-fns";

export async function GET(req: NextRequest) {
  const user = await authenticateApiKey(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = await rateLimit(user.id, "v1:statistics", RATE_LIMIT_REFERENCE);
  if (limited) return limited;

  const [
    totalProjects,
    totalVendors,
    activeGBs,
    shippedCount,
    categoryData,
    statusData,
    designerData,
    vendorData,
    monthlyGBData,
  ] = await Promise.all([
    prisma.project.count({ where: { published: true } }),
    prisma.vendor.count(),
    prisma.project.count({ where: { published: true, status: "GROUP_BUY" } }),
    prisma.project.count({ where: { published: true, shipped: true } }),
    prisma.project.groupBy({
      by: ["category"],
      where: { published: true },
      _count: { _all: true },
    }),
    prisma.project.groupBy({
      by: ["status"],
      where: { published: true },
      _count: { _all: true },
    }),
    prisma.project.groupBy({
      by: ["designer"],
      where: { published: true, designer: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { designer: "desc" } },
      take: 10,
    }),
    prisma.projectVendor.groupBy({
      by: ["vendorId"],
      where: { project: { published: true } },
      _count: { _all: true },
      orderBy: { _count: { vendorId: "desc" } },
      take: 10,
    }),
    Promise.all(
      Array.from({ length: 12 }, (_, i) => {
        const d = subMonths(new Date(), 11 - i);
        const start = new Date(d.getFullYear(), d.getMonth(), 1);
        const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
        return prisma.project
          .count({
            where: { published: true, gbStartDate: { gte: start, lte: end } },
          })
          .then((count) => ({ month: format(d, "MMM yy"), count }));
      })
    ),
  ]);

  // Resolve vendor names
  const vendorIds = vendorData
    .map((v) => v.vendorId)
    .filter((id): id is string => id !== null);

  const vendorNames = await prisma.vendor.findMany({
    where: { id: { in: vendorIds } },
    select: { id: true, name: true },
  });

  const vendorNameMap = new Map(vendorNames.map((v) => [v.id, v.name]));

  return NextResponse.json({
    data: {
      totalProjects,
      totalVendors,
      activeGBs,
      shippedCount,
      projectsByCategory: categoryData.map((c) => ({
        category: c.category,
        count: c._count._all,
      })),
      projectsByStatus: statusData.map((s) => ({
        status: s.status,
        count: s._count._all,
      })),
      gbsPerMonth: monthlyGBData,
      topDesigners: designerData.map((d) => ({
        name: d.designer ?? "Unknown",
        count: d._count._all,
      })),
      topVendors: vendorData.map((v) => ({
        name: vendorNameMap.get(v.vendorId!) ?? "Unknown",
        count: v._count._all,
      })),
    },
  });
}
