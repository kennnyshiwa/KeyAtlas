import Link from "next/link";
import { addDays } from "date-fns";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/shared/page-header";
import { ProjectGrid } from "@/components/projects/project-grid";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { ArrowRight, Lightbulb } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Mechanical Keyboard Interest Checks | KeyAtlas",
  description:
    "Discover the latest mechanical keyboard interest checks and upcoming concepts. Vote on designs that should become group buys and shape the next wave of keyboard releases.",
  alternates: { canonical: "/discover/interest-checks" },
};

export default async function DiscoverInterestChecksPage() {
  const now = new Date();
  const twoWeeksAgo = addDays(now, -14);

  const [recentInterestChecks, trendingInterestChecks] = await Promise.all([
    prisma.project.findMany({
      where: { published: true, status: "INTEREST_CHECK" },
      include: { vendor: { select: { name: true, slug: true } } },
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
    prisma.project.findMany({
      where: { published: true, status: "INTEREST_CHECK", createdAt: { gte: twoWeeksAgo } },
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
        title="Interest Checks"
        description="Follow concepts the community is exploring before they head to group buy."
      >
        <Button asChild variant="outline" size="sm">
          <Link href="/discover/group-buys">Group buys</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href="/discover/new-this-week">New this week</Link>
        </Button>
      </PageHeader>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold">Trending ideas</h2>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link href="/projects?status=INTEREST_CHECK">
              View all ICs
              <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </div>
        {trendingInterestChecks.length > 0 ? (
          <ProjectGrid projects={trendingInterestChecks} />
        ) : (
          <EmptyState
            title="No trending interest checks"
            description="Be the first to support a new idea or share your own."
          >
            <Button asChild>
              <Link href="/projects/submit">Submit a project</Link>
            </Button>
          </EmptyState>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Fresh submissions</h2>
          <div className="text-muted-foreground text-sm">
            Added in the last two weeks
          </div>
        </div>
        {recentInterestChecks.length > 0 ? (
          <ProjectGrid projects={recentInterestChecks} />
        ) : (
          <EmptyState
            title="No interest checks yet"
            description="Check back soon or browse current group buys."
          >
            <Button asChild variant="outline">
              <Link href="/discover/group-buys">See group buys</Link>
            </Button>
          </EmptyState>
        )}
      </section>
    </div>
  );
}
