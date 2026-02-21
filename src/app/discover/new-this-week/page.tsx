import Link from "next/link";
import { addDays } from "date-fns";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/shared/page-header";
import { ProjectGrid } from "@/components/projects/project-grid";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles } from "lucide-react";
import type { Metadata } from "next";

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

  const [projects, total] = await Promise.all([
    prisma.project.findMany({
      where,
      include: { vendor: { select: { name: true, slug: true } }, _count: { select: { favorites: true } } },
      orderBy: { createdAt: "desc" },
      skip: offset,
      take: limit,
    }),
    prisma.project.count({ where }),
  ]);

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
