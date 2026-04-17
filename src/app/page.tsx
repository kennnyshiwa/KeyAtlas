import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ProjectGrid } from "@/components/projects/project-grid";
import { EndingSoonCard } from "@/components/projects/ending-soon-card";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  TrendingUp,
  Clock,
  Sparkles,
  RefreshCw,
  ShoppingCart,
  MessageSquare,
  Store,
  BookOpen,
  CalendarDays,
  PenTool,
} from "lucide-react";
import { Logo } from "@/components/layout/logo";
import { addDays } from "date-fns";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import {
  scoreFollowedProjectRecommendation,
  scoreTrendingProject,
} from "@/lib/project-discovery";

export const metadata: Metadata = {
  title: "KeyAtlas - Mechanical Keyboard Community Hub",
  description:
    "Track interest checks, group buys, vendors, build guides, and community keyboard discussions.",
  alternates: { canonical: "/" },
};

export default async function HomePage() {
  const session = await auth();
  const now = new Date();
  const sevenDaysFromNow = addDays(now, 7);
  const fourteenDaysAgo = addDays(now, -14);
  const ninetyDaysAgo = addDays(now, -90);

  const [
    featuredProjects,
    recentProjects,
    endingSoonProjects,
    newICProjects,
    newGBProjects,
    trendingCandidates,
    recentlyUpdatedProjects,
    followedProjectIds,
    anchorFollowedProject,
    followedRecommendationCandidates,
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
      where: { published: true, updatedAt: { gte: fourteenDaysAgo } },
      include: {
        vendor: { select: { name: true, slug: true } },
        _count: { select: { favorites: true, followers: true, comments: true, updates: true } },
      },
      take: 40,
    }),
    prisma.project.findMany({
      where: { published: true },
      include: { vendor: { select: { name: true, slug: true } } },
      orderBy: { updatedAt: "desc" },
      take: 8,
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
          select: {
            targetProject: {
              select: { id: true, title: true, category: true, status: true, profile: true },
            },
          },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve(null),
    session?.user
      ? prisma.project.findMany({
          where: { published: true, updatedAt: { gte: ninetyDaysAgo } },
          include: {
            vendor: { select: { name: true, slug: true } },
            _count: { select: { favorites: true, followers: true, comments: true, updates: true } },
          },
          orderBy: { updatedAt: "desc" },
          take: 48,
        })
      : Promise.resolve([]),
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

  const followedIds = new Set(followedProjectIds.map((f) => f.targetId));
  const anchorProject = anchorFollowedProject?.targetProject ?? null;
  const followedRecommendations = anchorProject
    ? followedRecommendationCandidates
        .filter(
          (project) =>
            !followedIds.has(project.id) &&
            project.id !== anchorProject.id &&
            project.category === anchorProject.category
        )
        .sort((a, b) => {
          const scoreCandidate = (project: (typeof followedRecommendationCandidates)[number]) =>
            scoreFollowedProjectRecommendation(
              anchorProject,
              {
                category: project.category,
                status: project.status,
                profile: project.profile,
                favoritesCount: project._count.favorites,
                followersCount: project._count.followers,
                commentsCount: project._count.comments,
                updatesCount: project._count.updates,
                updatedAt: project.updatedAt,
                createdAt: project.createdAt,
              },
              now
            );

          const scoreDelta =
            scoreCandidate(b) - scoreCandidate(a);

          if (scoreDelta !== 0) return scoreDelta;
          return b.updatedAt.getTime() - a.updatedAt.getTime();
        })
        .slice(0, 6)
    : [];

  return (
    <div className="space-y-12">
      {/* Hero */}
      <section className="flex flex-col items-center gap-4 py-12 text-center">
        <div className="bg-primary/10 flex h-20 w-20 items-center justify-center rounded-full">
          <Logo size={64} />
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

      {followedRecommendations.length > 0 && anchorProject && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold tracking-tight">
              Because you follow {anchorProject.title}
            </h2>
            <Button variant="ghost" asChild>
              <Link href="/projects">
                More picks
                <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </div>
          <ProjectGrid projects={followedRecommendations} />
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
              <h2 className="text-2xl font-bold tracking-tight">Trending this week</h2>
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

      {/* Discover */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold tracking-tight">Discover</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {[
            { href: "/discover/group-buys", label: "Active Group Buys", icon: ShoppingCart },
            { href: "/discover/interest-checks", label: "Interest Checks", icon: MessageSquare },
            { href: "/discover/ending-soon", label: "Ending Soon", icon: Clock },
            { href: "/discover/new-this-week", label: "New This Week", icon: Sparkles },
            { href: "/discover/vendors", label: "Top Vendors", icon: Store },
            { href: "/discover/build-guides", label: "Build Guides", icon: BookOpen },
            { href: "/calendar", label: "Calendar", icon: CalendarDays },
            { href: "/designers", label: "Designers", icon: PenTool },
          ].map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="border-border hover:border-primary/50 hover:bg-accent flex items-center gap-3 rounded-lg border p-3 transition-colors"
            >
              <Icon className="text-muted-foreground h-5 w-5 shrink-0" />
              <span className="text-sm font-medium">{label}</span>
            </Link>
          ))}
        </div>
      </section>

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
