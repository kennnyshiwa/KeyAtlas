import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { ProjectGrid } from "@/components/projects/project-grid";
import { ProjectSearch } from "@/components/projects/project-search";
import { ProjectStatusTabs } from "@/components/projects/project-status-tabs";
import { ProjectViewWrapper } from "@/components/projects/project-view-wrapper";
import { AdvancedFilters } from "@/components/projects/advanced-filters";
import { SaveFilterButton } from "@/components/projects/save-filter-button";
import { ProjectSort } from "@/components/projects/project-sort";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import type { ProjectCategory, ProjectStatus } from "@/generated/prisma/client";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Projects",
  description: "Browse mechanical keyboard interest checks, group buys, and more.",
  alternates: { canonical: "/projects" },
};

interface ProjectsPageProps {
  searchParams: Promise<{
    category?: string;
    status?: string;
    page?: string;
    q?: string;
    featured?: string;
    profile?: string;
    designer?: string;
    vendor?: string;
    shipped?: string;
    sort?: string;
  }>;
}

export default async function ProjectsPage({ searchParams }: ProjectsPageProps) {
  const params = await searchParams;
  const page = Number(params.page ?? "1");
  const limit = 12;
  const offset = (page - 1) * limit;

  const categoryFilter = params.category?.split(",").filter(Boolean);
  const profileFilter = params.profile?.split(",").filter(Boolean);
  const vendorFilter = params.vendor?.split(",").filter(Boolean);

  const where = {
    published: true,
    ...(categoryFilter?.length && {
      category: { in: categoryFilter as ProjectCategory[] },
    }),
    ...(params.status && {
      status: params.status as ProjectStatus,
    }),
    ...(params.featured === "true" && { featured: true }),
    ...(params.shipped === "true" && { shipped: true }),
    ...(profileFilter?.length && {
      profile: { in: profileFilter },
    }),
    ...(params.designer && {
      designer: { contains: params.designer, mode: "insensitive" as const },
    }),
    ...(vendorFilter?.length && {
      vendorId: { in: vendorFilter },
    }),
    ...(params.q && {
      title: { contains: params.q, mode: "insensitive" as const },
    }),
  };

  const sortOptions: Record<string, object | object[]> = {
    newest: { createdAt: "desc" },
    oldest: { createdAt: "asc" },
    "a-z": { title: "asc" },
    "z-a": { title: "desc" },
    "most-followed": { favorites: { _count: "desc" } },
    updated: { updatedAt: "desc" },
    "gb-newest": [{ gbStartDate: "desc" }, { createdAt: "desc" }],
    "gb-oldest": [{ gbStartDate: "asc" }, { createdAt: "asc" }],
    "gb-ending": [{ gbEndDate: "asc" }, { createdAt: "desc" }],
  };
  const orderBy = sortOptions[params.sort ?? ""] ?? sortOptions.newest;

  // For GB sorts, only show projects that have a GB date set
  if (params.sort === "gb-newest" || params.sort === "gb-oldest") {
    Object.assign(where, { gbStartDate: { not: null } });
  }
  if (params.sort === "gb-ending") {
    Object.assign(where, { gbEndDate: { not: null, gte: new Date() } });
  }

  const session = await auth();

  const [projects, total, allVendors, followedProjectIds, anchorFollowedProject] = await Promise.all([
    prisma.project.findMany({
      where,
      include: {
        vendor: { select: { name: true, slug: true } },
        _count: { select: { favorites: true } },
      },
      orderBy,
      skip: offset,
      take: limit,
    }),
    prisma.project.count({ where }),
    prisma.vendor.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    session?.user
      ? prisma.follow.findMany({
          where: { userId: session.user.id, targetType: "PROJECT" },
          select: { targetId: true },
        })
      : Promise.resolve([]),
    session?.user
      ? prisma.follow.findFirst({
          where: { userId: session.user.id, targetType: "PROJECT", targetProject: { published: true } },
          select: { targetProject: { select: { id: true, title: true, category: true, status: true } } },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve(null),
  ]);

  const followedIds = new Set(followedProjectIds.map((f) => f.targetId));
  const followedRecommendations = anchorFollowedProject?.targetProject
    ? await prisma.project.findMany({
        where: {
          published: true,
          id: { notIn: [...followedIds, anchorFollowedProject.targetProject.id] },
          OR: [
            { category: anchorFollowedProject.targetProject.category },
            { status: anchorFollowedProject.targetProject.status },
          ],
        },
        include: {
          vendor: { select: { name: true, slug: true } },
          _count: { select: { favorites: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: 4,
      })
    : [];

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Projects"
        description="Browse mechanical keyboard interest checks, group buys, and more."
      />

      <Suspense>
        <ProjectStatusTabs />
      </Suspense>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Suspense>
          <div className="flex items-center gap-2">
            <AdvancedFilters vendors={allVendors} />
            <SaveFilterButton />
          </div>
        </Suspense>
        <div className="flex items-center gap-2">
          <Suspense>
            <ProjectSort />
          </Suspense>
          <div className="w-full sm:w-72">
            <Suspense>
              <ProjectSearch />
            </Suspense>
          </div>
        </div>
      </div>

      {followedRecommendations.length > 0 && anchorFollowedProject?.targetProject && (
        <section className="space-y-3 rounded-lg border p-4">
          <h2 className="text-lg font-semibold">From projects you follow: {anchorFollowedProject.targetProject.title}</h2>
          <ProjectGrid projects={followedRecommendations} viewMode="compact" />
        </section>
      )}

      {projects.length > 0 ? (
        <>
          <ProjectViewWrapper key={JSON.stringify(params)} projects={projects} />
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              {page > 1 && (
                <Button variant="outline" size="sm" asChild>
                  <Link
                    href={{
                      pathname: "/projects",
                      query: { ...params, page: page - 1 },
                    }}
                  >
                    Previous
                  </Link>
                </Button>
              )}
              <span className="text-muted-foreground text-sm">
                Page {page} of {totalPages}
              </span>
              {page < totalPages && (
                <Button variant="outline" size="sm" asChild>
                  <Link
                    href={{
                      pathname: "/projects",
                      query: { ...params, page: page + 1 },
                    }}
                  >
                    Next
                  </Link>
                </Button>
              )}
            </div>
          )}
        </>
      ) : (
        <EmptyState
          title="No projects found"
          description="Try adjusting your filters or search terms."
        />
      )}
    </div>
  );
}
