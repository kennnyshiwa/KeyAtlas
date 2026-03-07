import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Script from "next/script";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getSiteUrl, SITE_NAME } from "@/lib/site";
import { stripHtml } from "@/lib/strip-html";
import { ProjectHero } from "@/components/projects/project-hero";
import { ProjectGallery } from "@/components/projects/project-gallery";
import { ProjectSpecs } from "@/components/projects/project-specs";
import { ProjectTimeline } from "@/components/projects/project-timeline";
import { ProjectGrid } from "@/components/projects/project-grid";
import { FavoriteButton } from "@/components/projects/favorite-button";
import { CollectionButton } from "@/components/projects/collection-button";
import { ProjectAdminActions } from "@/components/projects/project-admin-actions";
import { ProjectVendorsDisplay } from "@/components/projects/project-vendors-display";
import { CommentSection } from "@/components/comments/comment-section";
import { UpdateTimeline } from "@/components/updates/update-timeline";
import { SoundTestSection } from "@/components/projects/sound-test-section";
import { ShareButton } from "@/components/social/share-button";
import { FollowButton } from "@/components/social/follow-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Project Preview",
  description: "Private preview of your project before publishing.",
  robots: {
    index: false,
    follow: false,
  },
};

interface PreviewPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string }>;
}

async function getProject(id: string) {
  return prisma.project.findUnique({
    where: { id },
    include: {
      images: { orderBy: { order: "asc" } },
      links: true,
      vendor: true,
      creator: { select: { id: true, name: true, image: true } },
      projectVendors: { include: { vendor: { select: { name: true, slug: true } } } },
      soundTests: { orderBy: { createdAt: "asc" } },
    },
  });
}

export default async function ProjectPreviewPage({ params, searchParams }: PreviewPageProps) {
  const session = await auth();
  if (!session?.user) {
    redirect("/sign-in");
  }

  const { id } = await params;
  const { returnTo } = await searchParams;
  const project = await getProject(id);

  if (!project) {
    notFound();
  }

  const isOwner = project.creatorId === session.user.id;
  const isAdmin = session.user.role === "ADMIN";

  if (!isOwner && !isAdmin) {
    notFound();
  }

  const relatedProjects = await prisma.project.findMany({
    where: {
      published: true,
      id: { not: project.id },
      OR: [
        ...(project.vendorId ? [{ vendorId: project.vendorId }] : []),
        { category: project.category },
      ],
    },
    include: {
      vendor: { select: { name: true, slug: true } },
      _count: { select: { favorites: true } },
    },
    orderBy: [{ featured: "desc" }, { updatedAt: "desc" }],
    take: 6,
  });

  const isCreator = session.user.id === project.creatorId;
  const isFollowing = !!(await prisma.follow.findUnique({
    where: {
      userId_targetType_targetId: {
        userId: session.user.id,
        targetType: "PROJECT",
        targetId: project.id,
      },
    },
  }));

  const siteUrl = getSiteUrl();
  const canonical = new URL(`/projects/${project.slug}`, siteUrl).toString();
  const description =
    project.metaDescription?.trim() ||
    (project.description ? stripHtml(project.description).slice(0, 160) : null) ||
    `${project.title} on ${SITE_NAME}`;
  const primaryImage =
    project.heroImage || project.images[0]?.url || `${siteUrl}/window.svg`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": project.vendor ? "Product" : "CreativeWork",
    name: project.title,
    description,
    url: canonical,
    image: primaryImage,
    brand: project.vendor?.name
      ? { "@type": "Brand", name: project.vendor.name }
      : undefined,
    creator: project.creator?.name
      ? { "@type": "Person", name: project.creator.name }
      : undefined,
    datePublished: project.createdAt?.toISOString?.(),
    dateModified: project.updatedAt?.toISOString?.(),
  };

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <Script
        id="project-json-ld-preview"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="flex items-center justify-between gap-3">
        <Badge variant="secondary">Preview Mode (Private)</Badge>
        <Button asChild variant="outline" size="sm">
          <Link href={returnTo || `/projects/submit/${project.id}/edit`}>Back to editor</Link>
        </Button>
      </div>
      <ProjectHero project={project} />

      <div className="flex flex-wrap items-center gap-2">
        <FavoriteButton projectId={project.id} />
        <CollectionButton projectId={project.id} />
        <FollowButton targetType="PROJECT" targetId={project.id} initialFollowing={isFollowing} size="sm" />
        <ShareButton
          title={project.title}
          geekhack={{
            status: project.status,
            designer: project.designer,
            descriptionHtml: project.description,
            images: project.images,
            links: project.links,
          }}
        />
        <ProjectAdminActions projectId={project.id} />
        {project.designer && (
          <>
            <span className="text-muted-foreground text-sm">by</span>
            <Badge variant="outline">{project.designer}</Badge>
          </>
        )}
      </div>

      <ProjectSpecs project={project} />

      <div className="grid gap-8 md:grid-cols-3">
        <div className="space-y-8 md:col-span-2">
          <ProjectVendorsDisplay projectVendors={project.projectVendors} />
          {project.images.length > 0 && <ProjectGallery images={project.images} />}
        </div>
        <div className="space-y-8">
          <ProjectTimeline project={project} />
        </div>
      </div>

      {(project.soundTests.length > 0 || project.category === "KEYBOARDS") && (
        <SoundTestSection
          projectId={project.id}
          soundTests={project.soundTests}
          canEdit={isCreator || session.user.role === "ADMIN"}
        />
      )}

      {relatedProjects.length > 0 && (
        <>
          <Separator />
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Related projects</h2>
              <Button asChild variant="ghost" size="sm">
                <Link href="/discover/group-buys">Discover more</Link>
              </Button>
            </div>
            <ProjectGrid projects={relatedProjects} />
          </section>
        </>
      )}

      <Separator />
      <UpdateTimeline projectId={project.id} creatorId={project.creatorId} />
      <Separator />
      <CommentSection projectId={project.id} />
    </div>
  );
}
