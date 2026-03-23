import Link from "next/link";
import { addDays } from "date-fns";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/shared/page-header";
import { ProjectGrid } from "@/components/projects/project-grid";
import { EndingSoonCard } from "@/components/projects/ending-soon-card";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { ArrowRight, Clock, Flame } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Active Keyboard Group Buys - March 2026 | KeyAtlas",
  description:
    "Browse all active mechanical keyboard group buys. Find live GBs, track pricing, check vendor availability, and join before the window closes.",
  alternates: { canonical: "/discover/group-buys" },
};

export default async function DiscoverGroupBuysPage() {
  const now = new Date();
  const sevenDaysFromNow = addDays(now, 7);

  const [endingSoon, latestGroupBuys, trendingGroupBuys] = await Promise.all([
    prisma.project.findMany({
      where: {
        published: true,
        status: "GROUP_BUY",
        gbEndDate: { gte: now, lte: sevenDaysFromNow },
      },
      include: { vendor: { select: { name: true, slug: true } } },
      orderBy: { gbEndDate: "asc" },
      take: 6,
    }),
    prisma.project.findMany({
      where: { published: true, status: "GROUP_BUY" },
      include: { vendor: { select: { name: true, slug: true } } },
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
    prisma.project.findMany({
      where: { published: true, status: "GROUP_BUY" },
      include: {
        vendor: { select: { name: true, slug: true } },
        _count: { select: { favorites: true } },
      },
      orderBy: { favorites: { _count: "desc" } },
      take: 8,
    }),
  ]);

  return (
    <div className="space-y-10">
      <PageHeader
        title="Group Buys"
        description="Live keyboard group buys with timelines, vendors, and pricing in one place."
      >
        <Button asChild variant="outline" size="sm">
          <Link href="/discover/ending-soon">Ending soon</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href="/discover/interest-checks">Interest checks</Link>
        </Button>
      </PageHeader>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-destructive" />
            <h2 className="text-xl font-semibold">Closing soon</h2>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link href="/projects?status=GROUP_BUY">
              View all group buys
              <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </div>
        {endingSoon.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {endingSoon.map((project) => (
              <EndingSoonCard key={project.id} project={project} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No group buys ending in the next week"
            description="Check the latest drops below or browse all group buys."
          >
            <Button asChild>
              <Link href="/projects?status=GROUP_BUY">Browse group buys</Link>
            </Button>
          </EmptyState>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Trending picks</h2>
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Flame className="h-4 w-4" />
            Based on saves & follows
          </div>
        </div>
        {trendingGroupBuys.length > 0 ? (
          <ProjectGrid projects={trendingGroupBuys} />
        ) : (
          <EmptyState
            title="No trending group buys yet"
            description="Discover the latest launches and mark your favorites to help others find them."
          />
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Latest launches</h2>
          <Button asChild variant="ghost" size="sm">
            <Link href="/discover/new-this-week">
              New this week
              <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </div>
        {latestGroupBuys.length > 0 ? (
          <ProjectGrid projects={latestGroupBuys} />
        ) : (
          <EmptyState
            title="No group buys available"
            description="We're adding more soon. Check interest checks for what's coming next."
          >
            <Button asChild variant="outline">
              <Link href="/discover/interest-checks">See interest checks</Link>
            </Button>
          </EmptyState>
        )}
      </section>
    </div>
  );
}
