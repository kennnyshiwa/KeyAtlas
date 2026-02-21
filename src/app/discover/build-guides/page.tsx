import Link from "next/link";
import Image from "next/image";
import { formatDistanceToNow } from "date-fns";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ProjectGrid } from "@/components/projects/project-grid";
import { EmptyState } from "@/components/shared/empty-state";
import { BookOpen, Hammer } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Mechanical Keyboard Build Guides | KeyAtlas",
  description:
    "Step-by-step keyboard build guides from the community. Learn mods, assembly tips, and see projects to try next.",
  alternates: { canonical: "/discover/build-guides" },
};

type GuideListItem = {
  id: string;
  title: string;
  slug: string;
  heroImage: string | null;
  difficulty: string | null;
  createdAt: Date;
  updatedAt: Date;
  author: { name: string | null; displayName: string | null; username: string | null; image: string | null };
};

function GuideCard({ guide }: { guide: GuideListItem }) {
  const authorName = guide.author.displayName || guide.author.name || "Anonymous";
  const initials = authorName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <Link href={`/guides/${guide.slug}`}>
      <Card className="group h-full overflow-hidden transition-shadow hover:shadow-lg">
        {guide.heroImage && (
          <div className="relative aspect-[16/9] overflow-hidden">
            <Image
              src={guide.heroImage}
              alt={guide.title}
              fill
              className="object-cover transition-transform group-hover:scale-105"
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            />
          </div>
        )}
        <CardContent className="space-y-2 p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Avatar className="h-5 w-5">
              <AvatarImage src={guide.author.image ?? undefined} />
              <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
            </Avatar>
            <span>{authorName}</span>
            <span>·</span>
            <span>{formatDistanceToNow(guide.createdAt, { addSuffix: true })}</span>
          </div>
          <h3 className="line-clamp-2 font-semibold">{guide.title}</h3>
          {guide.difficulty && (
            <Badge variant="secondary" className="text-xs">
              {guide.difficulty}
            </Badge>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

export default async function DiscoverBuildGuidesPage() {
  const [latestGuides, recentlyUpdatedGuides, pairingProjects] = await Promise.all([
    prisma.buildGuide.findMany({
      where: { published: true },
      include: { author: { select: { name: true, displayName: true, username: true, image: true } } },
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
    prisma.buildGuide.findMany({
      where: { published: true },
      include: { author: { select: { name: true, displayName: true, username: true, image: true } } },
      orderBy: { updatedAt: "desc" },
      take: 6,
    }),
    prisma.project.findMany({
      where: { published: true },
      include: { vendor: { select: { name: true, slug: true } } },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
  ]);

  return (
    <div className="space-y-10">
      <PageHeader
        title="Build Guides"
        description="Community-sourced build walkthroughs and mod tips."
      >
        <Button asChild variant="outline" size="sm">
          <Link href="/guides">All guides</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href="/discover/interest-checks">Discover projects</Link>
        </Button>
      </PageHeader>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold">Latest build guides</h2>
        </div>
        {latestGuides.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {latestGuides.map((guide) => (
              <GuideCard key={guide.id} guide={guide} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No guides published yet"
            description="New build guides will appear here once published."
          >
            <Button asChild>
              <Link href="/guides/new">Write a guide</Link>
            </Button>
          </EmptyState>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Hammer className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-xl font-semibold">Recently updated</h2>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link href="/guides">Browse all</Link>
          </Button>
        </div>
        {recentlyUpdatedGuides.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recentlyUpdatedGuides.map((guide) => (
              <GuideCard key={guide.id} guide={guide} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No updates yet"
            description="Updated guides will appear here."
          />
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Projects to try these guides on</h2>
          <Button asChild variant="ghost" size="sm">
            <Link href="/discover/new-this-week">New this week</Link>
          </Button>
        </div>
        {pairingProjects.length > 0 ? (
          <ProjectGrid projects={pairingProjects} />
        ) : (
          <EmptyState
            title="No projects yet"
            description="Check back soon for new kits to build."
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
