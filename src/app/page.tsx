import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ProjectGrid } from "@/components/projects/project-grid";
import { Button } from "@/components/ui/button";
import { ArrowRight, Keyboard } from "lucide-react";

export default async function HomePage() {
  const [featuredProjects, recentProjects] = await Promise.all([
    prisma.project.findMany({
      where: { published: true, featured: true },
      include: { vendor: { select: { name: true, slug: true } } },
      orderBy: { createdAt: "desc" },
      take: 3,
    }),
    prisma.project.findMany({
      where: { published: true },
      include: { vendor: { select: { name: true, slug: true } } },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
  ]);

  return (
    <div className="space-y-12">
      <section className="flex flex-col items-center gap-4 py-12 text-center">
        <div className="bg-primary/10 rounded-full p-3">
          <Keyboard className="text-primary h-8 w-8" />
        </div>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          KeyVault
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
        </div>
      </section>

      {featuredProjects.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold tracking-tight">Featured</h2>
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

      {recentProjects.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold tracking-tight">
              Recent Projects
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
