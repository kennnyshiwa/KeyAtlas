import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/shared/page-header";
import { StatsOverview } from "@/components/statistics/stats-overview";
import { CategoryChart } from "@/components/statistics/category-chart";
import { StatusChart } from "@/components/statistics/status-chart";
import { MonthlyChart } from "@/components/statistics/monthly-chart";
import { TopDesignersChart } from "@/components/statistics/top-designers-chart";
import { TopVendorsChart } from "@/components/statistics/top-vendors-chart";
import { CATEGORY_LABELS, STATUS_LABELS } from "@/lib/constants";
import { format, subMonths } from "date-fns";

export const metadata = {
  title: "Statistics",
  description: "KeyAtlas community statistics and trends.",
};

export default async function StatisticsPage() {
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
    prisma.project.count({
      where: { published: true, status: "GROUP_BUY" },
    }),
    prisma.project.count({
      where: { published: true, shipped: true },
    }),
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
    prisma.project.groupBy({
      by: ["vendorId"],
      where: { published: true, vendorId: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { vendorId: "desc" } },
      take: 10,
    }),
    // Get GBs per month for last 12 months
    Promise.all(
      Array.from({ length: 12 }, (_, i) => {
        const d = subMonths(new Date(), 11 - i);
        const start = new Date(d.getFullYear(), d.getMonth(), 1);
        const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
        return prisma.project
          .count({
            where: {
              published: true,
              gbStartDate: { gte: start, lte: end },
            },
          })
          .then((count) => ({
            month: format(d, "MMM yy"),
            count,
          }));
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

  const categoryChartData = categoryData.map((c) => ({
    name: CATEGORY_LABELS[c.category],
    value: c._count._all,
  }));

  const statusChartData = statusData.map((s) => ({
    name: STATUS_LABELS[s.status],
    value: s._count._all,
  }));

  const topDesignersData = designerData.map((d) => ({
    name: d.designer ?? "Unknown",
    count: d._count._all,
  }));

  const topVendorsData = vendorData.map((v) => ({
    name: vendorNameMap.get(v.vendorId!) ?? "Unknown",
    count: v._count._all,
  }));

  return (
    <div className="space-y-8">
      <PageHeader
        title="Statistics"
        description="Community statistics and trends."
      />

      <StatsOverview
        stats={[
          { label: "Total Projects", value: totalProjects },
          { label: "Vendors", value: totalVendors },
          { label: "Active GBs", value: activeGBs },
          { label: "Shipped", value: shippedCount },
        ]}
      />

      <div className="grid gap-6 md:grid-cols-2">
        <CategoryChart data={categoryChartData} />
        <StatusChart data={statusChartData} />
      </div>

      <MonthlyChart data={monthlyGBData} />

      <div className="grid gap-6 md:grid-cols-2">
        <TopDesignersChart data={topDesignersData} />
        <TopVendorsChart data={topVendorsData} />
      </div>
    </div>
  );
}
