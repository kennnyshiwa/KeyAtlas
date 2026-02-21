import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ProjectHero } from "@/components/projects/project-hero";
import { ProjectGallery } from "@/components/projects/project-gallery";
import { ProjectSpecs } from "@/components/projects/project-specs";
import { ProjectTimeline } from "@/components/projects/project-timeline";
import { FavoriteButton } from "@/components/projects/favorite-button";
import { CollectionButton } from "@/components/projects/collection-button";
import { ProjectAdminActions } from "@/components/projects/project-admin-actions";
import { ProjectVendorsDisplay } from "@/components/projects/project-vendors-display";
import { CommentSection } from "@/components/comments/comment-section";
import { UpdateTimeline } from "@/components/updates/update-timeline";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { Metadata } from "next";

interface ProjectPageProps {
  params: Promise<{ slug: string }>;
}

async function getProject(slug: string) {
  return prisma.project.findUnique({
    where: { slug },
    include: {
      images: { orderBy: { order: "asc" } },
      links: true,
      vendor: true,
      creator: { select: { id: true, name: true, image: true } },
      projectVendors: { include: { vendor: { select: { name: true, slug: true } } } },
    },
  });
}

export async function generateMetadata({
  params,
}: ProjectPageProps): Promise<Metadata> {
  const { slug } = await params;
  const project = await getProject(slug);

  if (!project) return { title: "Not Found" };

  return {
    title: project.metaTitle ?? project.title,
    description:
      project.metaDescription ??
      project.description?.slice(0, 160) ??
      `${project.title} on KeyVault`,
    openGraph: {
      title: project.metaTitle ?? project.title,
      description:
        project.metaDescription ??
        project.description?.slice(0, 160) ??
        undefined,
      images: project.heroImage ? [project.heroImage] : undefined,
    },
  };
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { slug } = await params;
  const project = await getProject(slug);

  if (!project || !project.published) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <ProjectHero project={project} />

      <div className="flex flex-wrap items-center gap-2">
        <FavoriteButton projectId={project.id} />
        <CollectionButton projectId={project.id} />
        <ProjectAdminActions projectId={project.id} />
        {project.designer && (
          <>
            <span className="text-muted-foreground text-sm">by</span>
            <Badge variant="outline">
              {project.designer}
            </Badge>
          </>
        )}
      </div>

      <div className="grid gap-8 md:grid-cols-3">
        <div className="space-y-8 md:col-span-2">
          <ProjectSpecs project={project} />
          <ProjectVendorsDisplay projectVendors={project.projectVendors} />
          {project.images.length > 0 && (
            <ProjectGallery images={project.images} />
          )}
        </div>
        <div className="space-y-8">
          <ProjectTimeline project={project} />
        </div>
      </div>

      <Separator />
      <UpdateTimeline projectId={project.id} creatorId={project.creatorId} />
      <Separator />
      <CommentSection projectId={project.id} />
    </div>
  );
}
