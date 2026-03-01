import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ProjectGrid } from "@/components/projects/project-grid";
import { EndingSoonCard } from "@/components/projects/ending-soon-card";
import { Button } from "@/components/ui/button";
import { ArrowRight, Keyboard, TrendingUp, Clock, Sparkles, RefreshCw } from "lucide-react";
import { addDays } from "date-fns";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "KeyAtlas - Mechanical Keyboard Community Hub",
  description:
    "Track interest checks, group buys, vendors, build guides, and community keyboard discussions.",
  alternates: { canonical: "/" },
};

export default async function HomePage() {
  const now = new Date();
  const sevenDaysFromNow = addDays(now, 7);
  const fourteenDaysAgo = addDays(now, -14);

  const [
    featuredProjects,
    recentProjects,
    endingSoonProjects,
    newICProjects,
    newGBProjects,
    trendingProjects,
    recentlyUpdatedProjects,
  ] = await Promise.all([
    prisma.project.findMany({
      where: { published: true, featured: true },
      include: { vendor: { select: { name: true, slug: true } } },
      orderBy: { createdAt: "desc" },
      take: 4,
    }),
    prisma.project.findMany({
      where: { published: true },
      include: { vendor: { select: { name: true, slug: true } } },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
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
      where: {
        published: true,
        status: "INTEREST_CHECK",
        createdAt: { gte: fourteenDaysAgo },
      },
      include: { vendor: { select: { name: true, slug: true } } },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    prisma.project.findMany({
      where: {
        published: true,
        status: "GROUP_BUY",
        createdAt: { gte: fourteenDaysAgo },
      },
      include: { vendor: { select: { name: true, slug: true } } },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    prisma.project.findMany({
      where: { published: true },
      include: {
        vendor: { select: { name: true, slug: true } },
        _count: { select: { favorites: true } },
      },
      orderBy: { favorites: { _count: "desc" } },
      take: 8,
    }),
    prisma.project.findMany({
      where: { published: true },
      include: { vendor: { select: { name: true, slug: true } } },
      orderBy: { updatedAt: "desc" },
      take: 8,
    }),
  ]);

  return (
    <div className="space-y-12">
      {/* Hero */}
      <section className="flex flex-col items-center gap-4 py-12 text-center">
        <div className="bg-primary/10 rounded-full p-3">
          <Keyboard className="text-primary h-8 w-8" />
        </div>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          KeyAtlas
        </h1>
        <p className="text-muted-foreground max-w-2xl text-lg">
          Your mechanical keyboard community hub. Track interest checks, group
          buys, vendors, and more — all in one place.
        </p>
        <div className="flex gap-3">
          <Button asChild size="lg">
            <Link href="/projects">
              Browse Projects
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/forums">
              Forums
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      {/* Ending Soon */}
      {endingSoonProjects.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="text-destructive h-5 w-5" />
              <h2 className="text-2xl font-bold tracking-tight">Ending Soon</h2>
            </div>
            <Button variant="ghost" asChild>
              <Link href="/projects?status=GROUP_BUY">
                View all GBs
                <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {endingSoonProjects.map((project) => (
              <EndingSoonCard key={project.id} project={project} />
            ))}
          </div>
        </section>
      )}

      {/* Featured */}
      {featuredProjects.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="text-yellow-500 h-5 w-5" />
              <h2 className="text-2xl font-bold tracking-tight">Featured</h2>
            </div>
            <Button variant="ghost" asChild>
              <Link href="/projects?featured=true">
                View all
                <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </div>
          <ProjectGrid projects={featuredProjects} />
        </section>
      )}

      {/* New Interest Checks */}
      {newICProjects.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold tracking-tight">
              New Interest Checks
            </h2>
            <Button variant="ghost" asChild>
              <Link href="/projects?status=INTEREST_CHECK">
                View all
                <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </div>
          <ProjectGrid projects={newICProjects} />
        </section>
      )}

      {/* New Group Buys */}
      {newGBProjects.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold tracking-tight">
              New Group Buys
            </h2>
            <Button variant="ghost" asChild>
              <Link href="/projects?status=GROUP_BUY">
                View all
                <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </div>
          <ProjectGrid projects={newGBProjects} />
        </section>
      )}

      {/* Trending */}
      {trendingProjects.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="text-primary h-5 w-5" />
              <h2 className="text-2xl font-bold tracking-tight">Trending</h2>
            </div>
            <Button variant="ghost" asChild>
              <Link href="/projects">
                View all
                <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </div>
          <ProjectGrid projects={trendingProjects} />
        </section>
      )}

      {/* Recently Updated */}
      {recentlyUpdatedProjects.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <RefreshCw className="text-muted-foreground h-5 w-5" />
              <h2 className="text-2xl font-bold tracking-tight">
                Recently Updated
              </h2>
            </div>
            <Button variant="ghost" asChild>
              <Link href="/projects">
                View all
                <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </div>
          <ProjectGrid projects={recentlyUpdatedProjects} />
        </section>
      )}

      {/* Recent Projects */}
      {recentProjects.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold tracking-tight">
              Latest Projects
            </h2>
            <Button variant="ghost" asChild>
              <Link href="/projects">
                View all
                <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </div>
          <ProjectGrid projects={recentProjects} />
        </section>
      )}

      {recentProjects.length === 0 && (
        <section className="flex flex-col items-center gap-2 py-12 text-center">
          <p className="text-muted-foreground text-lg">
            No projects yet. Check back soon!
          </p>
        </section>
      )}
    </div>
  );
}
