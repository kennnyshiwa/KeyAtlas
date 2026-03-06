import Link from "next/link";
import { addDays } from "date-fns";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/shared/page-header";
import { ProjectGrid } from "@/components/projects/project-grid";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles, TrendingUp } from "lucide-react";
import type { Metadata } from "next";
import { scoreTrendingProject } from "@/lib/project-discovery";

export const metadata: Metadata = {
  title: "New This Week | KeyAtlas",
  description: "Projects created in the last 7 days across interest checks and group buys.",
  alternates: { canonical: "/discover/new-this-week" },
};

interface NewThisWeekPageProps {
  searchParams: Promise<{ page?: string }>;
}

export default async function NewThisWeekPage({ searchParams }: NewThisWeekPageProps) {
  const params = await searchParams;
  const page = Math.max(Number(params.page ?? "1"), 1);
  const limit = 18;
  const offset = (page - 1) * limit;

  const sevenDaysAgo = addDays(new Date(), -7);
  const where = {
    published: true,
    createdAt: { gte: sevenDaysAgo },
  } as const;

  const now = new Date();

  const [projects, total, trendingCandidates] = await Promise.all([
    prisma.project.findMany({
      where,
      include: { vendor: { select: { name: true, slug: true } }, _count: { select: { favorites: true } } },
      orderBy: { createdAt: "desc" },
      skip: offset,
      take: limit,
    }),
    prisma.project.count({ where }),
    prisma.project.findMany({
      where: { published: true, updatedAt: { gte: sevenDaysAgo } },
      include: {
        vendor: { select: { name: true, slug: true } },
        _count: { select: { favorites: true, followers: true, comments: true, updates: true } },
      },
      take: 24,
    }),
  ]);

  const trendingProjects = trendingCandidates
    .sort((a, b) => {
      const scoreDelta =
        scoreTrendingProject(
          {
            favoritesCount: b._count.favorites,
            followersCount: b._count.followers,
            commentsCount: b._count.comments,
            updatesCount: b._count.updates,
            updatedAt: b.updatedAt,
            createdAt: b.createdAt,
          },
          now
        ) -
        scoreTrendingProject(
          {
            favoritesCount: a._count.favorites,
            followersCount: a._count.followers,
            commentsCount: a._count.comments,
            updatesCount: a._count.updates,
            updatedAt: a.updatedAt,
            createdAt: a.createdAt,
          },
          now
        );
      if (scoreDelta !== 0) return scoreDelta;
      return b.updatedAt.getTime() - a.updatedAt.getTime();
    })
    .slice(0, 8);

  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

  return (
    <div className="space-y-8">
      <PageHeader
        title="New this week"
        description="Fresh community submissions from the past 7 days."
      >
        <Button asChild variant="outline" size="sm">
          <Link href="/discover/group-buys">Group buys</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href="/discover/interest-checks">Interest checks</Link>
        </Button>
      </PageHeader>

      {trendingProjects.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <TrendingUp className="h-4 w-4 text-primary" />
            Trending this week
          </div>
          <ProjectGrid projects={trendingProjects} />
        </section>
      )}

      {projects.length > 0 ? (
        <>
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Sparkles className="h-4 w-4 text-primary" />
            Showing {projects.length} of {total} new submissions this week
          </div>
          <ProjectGrid projects={projects} />
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              {page > 1 && (
                <Button variant="outline" size="sm" asChild>
                  <Link href={{ pathname: "/discover/new-this-week", query: { page: page - 1 } }}>
                    Previous
                  </Link>
                </Button>
              )}
              <span className="text-muted-foreground text-sm">
                Page {page} of {totalPages}
              </span>
              {page < totalPages && (
                <Button variant="outline" size="sm" asChild>
                  <Link href={{ pathname: "/discover/new-this-week", query: { page: page + 1 } }}>
                    Next
                  </Link>
                </Button>
              )}
            </div>
          )}
        </>
      ) : (
        <EmptyState
          title="No new projects this week"
          description="Check back soon or explore all active projects."
        >
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild>
              <Link href="/projects">Browse all projects</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/projects/submit">Submit yours</Link>
            </Button>
          </div>
        </EmptyState>
      )}

      <div className="flex items-center justify-between rounded-lg border p-4">
        <div>
          <h3 className="font-semibold">Stay ahead of launches</h3>
          <p className="text-muted-foreground text-sm">See which buys are closing soon so you don&apos;t miss them.</p>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/discover/ending-soon">
            Ending soon
            <ArrowRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
