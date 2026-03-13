import Link from "next/link";
import { addDays } from "date-fns";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/shared/page-header";
import { ProjectGrid } from "@/components/projects/project-grid";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { ArrowRight, Clock } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Ending Soon Group Buys | KeyAtlas",
  description:
    "Group buys ending in the next 7 days. See timelines and vendors so you don't miss closing windows.",
  alternates: { canonical: "/discover/ending-soon" },
};

interface EndingSoonPageProps {
  searchParams: Promise<{ page?: string }>;
}

export default async function EndingSoonPage({ searchParams }: EndingSoonPageProps) {
  const params = await searchParams;
  const page = Math.max(Number(params.page ?? "1"), 1);
  const limit = 18;
  const offset = (page - 1) * limit;

  const now = new Date();
  // Include midnight-stored dates that are still "today" by querying from start of current UTC day
  const startOfUtcDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const sevenDaysFromNow = addDays(now, 7);

  const where = {
    published: true,
    status: "GROUP_BUY" as const,
    gbEndDate: { gte: startOfUtcDay, lte: sevenDaysFromNow },
  };

  const [projects, total] = await Promise.all([
    prisma.project.findMany({
      where,
      include: { vendor: { select: { name: true, slug: true } }, _count: { select: { favorites: true } } },
      orderBy: { gbEndDate: "asc" },
      skip: offset,
      take: limit,
    }),
    prisma.project.count({ where }),
  ]);

  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Ending Soon"
        description="Group buys closing in the next 7 days."
      >
        <Button asChild variant="outline" size="sm">
          <Link href="/discover/group-buys">All group buys</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href="/discover/new-this-week">New this week</Link>
        </Button>
      </PageHeader>

      {projects.length > 0 ? (
        <>
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Clock className="h-4 w-4" />
            Showing {projects.length} of {total} ending within 7 days
          </div>
          <ProjectGrid projects={projects} />
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              {page > 1 && (
                <Button variant="outline" size="sm" asChild>
                  <Link href={{ pathname: "/discover/ending-soon", query: { page: page - 1 } }}>
                    Previous
                  </Link>
                </Button>
              )}
              <span className="text-muted-foreground text-sm">
                Page {page} of {totalPages}
              </span>
              {page < totalPages && (
                <Button variant="outline" size="sm" asChild>
                  <Link href={{ pathname: "/discover/ending-soon", query: { page: page + 1 } }}>
                    Next
                  </Link>
                </Button>
              )}
            </div>
          )}
        </>
      ) : (
        <EmptyState
          title="No group buys ending this week"
          description="Check all live buys or upcoming interest checks instead."
        >
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild>
              <Link href="/discover/group-buys">View group buys</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/discover/interest-checks">See interest checks</Link>
            </Button>
          </div>
        </EmptyState>
      )}

      <div className="flex items-center justify-between rounded-lg border p-4">
        <div>
          <h3 className="font-semibold">Want more?</h3>
          <p className="text-muted-foreground text-sm">Browse the full calendar of projects.</p>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/calendar">
            Open calendar
            <ArrowRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
