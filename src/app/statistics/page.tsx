import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/shared/page-header";
import { StatsOverview } from "@/components/statistics/stats-overview";
import { CategoryChart } from "@/components/statistics/category-chart";
import { StatusChart } from "@/components/statistics/status-chart";
import { MonthlyChart } from "@/components/statistics/monthly-chart";
import { TopDesignersChart } from "@/components/statistics/top-designers-chart";
import { TopVendorsChart } from "@/components/statistics/top-vendors-chart";
import { YearlyGrowthChart } from "@/components/statistics/yearly-growth-chart";
import { PriceTrendsChart } from "@/components/statistics/price-trends-chart";
import { CategoryEvolutionChart } from "@/components/statistics/category-evolution-chart";
import { DesignerLeaderboard } from "@/components/statistics/designer-leaderboard";
import { VendorMarketShare } from "@/components/statistics/vendor-market-share";
import { SeasonalHeatmap } from "@/components/statistics/seasonal-heatmap";
import { TagTrendsChart } from "@/components/statistics/tag-trends-chart";
import { ProfileTrendsChart } from "@/components/statistics/profile-trends-chart";
import { ProjectTimeline } from "@/components/statistics/project-timeline";
import { CATEGORY_LABELS, STATUS_LABELS } from "@/lib/constants";

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
    // Deep analytics queries
    yearlyByCategory,
    priceByYear,
    seasonality,
    designerDetails,
    tagTrends,
    timelineProjects,
    vendorMarketShareData,
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
    prisma.projectVendor.groupBy({
      by: ["vendorId"],
      where: { project: { published: true } },
      _count: { _all: true },
      orderBy: { _count: { vendorId: "desc" } },
      take: 10,
    }),
    // Get ALL GBs per month (full history)
    prisma.$queryRaw<{ month: string; count: number }[]>`
      SELECT TO_CHAR("gbStartDate", 'YYYY-MM') as month, COUNT(*)::int as count
      FROM projects WHERE published = true AND "gbStartDate" IS NOT NULL
      GROUP BY month ORDER BY month
    `,

    // Yearly project counts by category
    prisma.$queryRaw<{ year: number; category: string; count: number }[]>`
      SELECT EXTRACT(YEAR FROM "createdAt")::int as year, category, COUNT(*)::int as count
      FROM projects WHERE published = true
      GROUP BY year, category ORDER BY year, category
    `,

    // Average price by year and category
    prisma.$queryRaw<{ year: number; category: string; avg_price: number; sample_size: number }[]>`
      SELECT EXTRACT(YEAR FROM "createdAt")::int as year, category,
        ROUND(AVG("priceMin")/100, 2)::float as avg_price,
        COUNT(*)::int as sample_size
      FROM projects WHERE published = true AND "priceMin" IS NOT NULL
      GROUP BY year, category ORDER BY year
    `,

    // Monthly seasonality (all years combined)
    prisma.$queryRaw<{ month: number; count: number }[]>`
      SELECT EXTRACT(MONTH FROM "createdAt")::int as month, COUNT(*)::int as count
      FROM projects WHERE published = true
      GROUP BY month ORDER BY month
    `,

    // Designer details
    prisma.$queryRaw<{
      designer: string;
      total: number;
      keycaps: number;
      keyboards: number;
      ics: number;
      gbs: number;
      avg_price: number | null;
      first_year: number;
      last_year: number;
    }[]>`
      SELECT designer,
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE category = 'KEYCAPS')::int as keycaps,
        COUNT(*) FILTER (WHERE category = 'KEYBOARDS')::int as keyboards,
        COUNT(*) FILTER (WHERE status = 'INTEREST_CHECK')::int as ics,
        COUNT(*) FILTER (WHERE status IN ('GROUP_BUY','PRODUCTION','COMPLETED','IN_STOCK','EXTRAS','SHIPPING'))::int as gbs,
        ROUND(AVG("priceMin") FILTER (WHERE "priceMin" IS NOT NULL)/100, 2)::float as avg_price,
        MIN(EXTRACT(YEAR FROM "createdAt"))::int as first_year,
        MAX(EXTRACT(YEAR FROM "createdAt"))::int as last_year
      FROM projects WHERE published = true AND designer IS NOT NULL AND designer != ''
      GROUP BY designer ORDER BY COUNT(*) DESC LIMIT 500
    `,

    // Tag trends by year
    prisma.$queryRaw<{ year: number; tag: string; count: number }[]>`
      SELECT EXTRACT(YEAR FROM "createdAt")::int as year, unnest(tags) as tag, COUNT(*)::int as count
      FROM projects WHERE published = true AND array_length(tags, 1) > 0
      GROUP BY year, tag
      HAVING COUNT(*) > 2
      ORDER BY year, count DESC
    `,

    // Full project timeline for virtual list
    prisma.$queryRaw<{
      id: string; title: string; slug: string; category: string;
      status: string; designer: string | null; priceMin: number | null;
      createdAt: Date;
    }[]>`
      SELECT id, title, slug, category, status, designer, "priceMin", "createdAt"
      FROM projects WHERE published = true
      ORDER BY "createdAt" DESC
    `,

    // Top vendors with project count and regions
    prisma.$queryRaw<{ name: string; regions: string[] | null; count: number }[]>`
      SELECT v.name, v."regionsServed" as regions, COUNT(pv.id)::int as count
      FROM vendors v JOIN project_vendors pv ON pv."vendorId" = v.id
      JOIN projects p ON p.id = pv."projectId" AND p.published = true
      GROUP BY v.name, v."regionsServed"
      ORDER BY count DESC LIMIT 20
    `,
  ]);

  // Resolve vendor names for existing top vendors chart
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

      {/* ── Overview ── */}
      <h2 className="text-xl font-semibold tracking-tight">Overview</h2>

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

      {/* ── Deep Analytics ── */}
      <div className="border-t pt-8">
        <h2 className="text-xl font-semibold tracking-tight mb-2">
          Deep Analytics
        </h2>
        <p className="text-sm text-muted-foreground mb-6">
          Historical analysis spanning 2010–2026
        </p>
      </div>

      <YearlyGrowthChart data={yearlyByCategory} />

      <div className="grid gap-6 md:grid-cols-2">
        <PriceTrendsChart data={priceByYear} />
        <CategoryEvolutionChart data={yearlyByCategory} />
      </div>

      <SeasonalHeatmap data={seasonality} />

      <DesignerLeaderboard data={designerDetails} />

      <ProjectTimeline data={JSON.parse(JSON.stringify(timelineProjects))} />

      <VendorMarketShare
        data={vendorMarketShareData}
        totalProjects={totalProjects}
      />

      <TagTrendsChart data={tagTrends} />

      <ProfileTrendsChart data={tagTrends} />
    </div>
  );
}
