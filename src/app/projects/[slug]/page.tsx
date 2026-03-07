import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Script from "next/script";
import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
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
import { ProjectSocialProof } from "@/components/projects/project-social-proof";
import { ReferralTracker } from "@/components/projects/referral-tracker";
import { ReportButton } from "@/components/projects/report-button";
import { ProjectChangeLog } from "@/components/projects/project-changelog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { auth } from "@/lib/auth";
import type { Metadata } from "next";
import { getSiteUrl, SITE_NAME } from "@/lib/site";
import { buildEmbedDescription } from "@/lib/embed-description";

export const dynamic = "force-dynamic";

interface ProjectPageProps {
  params: Promise<{ slug: string }>;
}

async function getProject(slug: string) {
  const include = {
    images: { orderBy: { order: "asc" as const } },
    links: true,
    vendor: true,
    creator: { select: { id: true, name: true, image: true } },
    projectVendors: { include: { vendor: { select: { name: true, slug: true } } } },
    soundTests: { orderBy: { createdAt: "asc" as const } },
    _count: { select: { followers: true, favorites: true, comments: true } },
  };

  const direct = await prisma.project.findUnique({ where: { slug }, include });
  if (direct) return direct;

  const topicId = slug.match(/^(\d{5,})-/)?.[1];
  if (!topicId) return null;

  const byGeekhackTopic = await prisma.project.findFirst({
    where: {
      links: {
        some: {
          url: { contains: `topic=${topicId}.0` },
        },
      },
    },
    include,
  });

  return byGeekhackTopic;
}

export async function generateMetadata({
  params,
}: ProjectPageProps): Promise<Metadata> {
  const { slug } = await params;
  const project = await getProject(slug);

  if (!project) return { title: "Not Found" };

  const siteUrl = getSiteUrl();
  const canonical = new URL(`/projects/${project.slug}`, siteUrl).toString();
  const title = project.metaTitle?.trim() || project.title || SITE_NAME;
  const description = buildEmbedDescription({
    ...project,
    followerCount: project._count.followers,
    favoriteCount: project._count.favorites,
    priceMin: project.priceMin,
    priceMax: project.priceMax,
    currency: project.currency,
  });
  const primaryImage =
    project.heroImage || project.images[0]?.url || `${siteUrl}/window.svg`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      type: "website",
      siteName: SITE_NAME,
      images: primaryImage ? [primaryImage] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: primaryImage ? [primaryImage] : undefined,
    },
  };
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { slug } = await params;
  const project = await getProject(slug);

  if (!project || !project.published) {
    notFound();
  }

  if (project.slug !== slug) {
    redirect(`/projects/${project.slug}`);
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
    orderBy: [
      { featured: "desc" },
      { updatedAt: "desc" },
    ],
    take: 4,
  });

  const session = await auth();
  const isCreator = session?.user?.id === project.creatorId;
  const isFollowing = session?.user
    ? !!(await prisma.follow.findUnique({
        where: {
          userId_targetType_targetId: {
            userId: session.user.id,
            targetType: "PROJECT",
            targetId: project.id,
          },
        },
      }))
    : false;

  const siteUrl = getSiteUrl();
  const canonical = new URL(`/projects/${project.slug}`, siteUrl).toString();
  const description = buildEmbedDescription({
    ...project,
    followerCount: project._count.followers,
    favoriteCount: project._count.favorites,
    priceMin: project.priceMin,
    priceMax: project.priceMax,
    currency: project.currency,
  });
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
      <Suspense fallback={null}>
        <ReferralTracker slug={project.slug} />
      </Suspense>
      <Script
        id="project-json-ld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ProjectHero project={project} />

      <ProjectSocialProof
        projectId={project.id}
        followerCount={project._count.followers}
        favoriteCount={project._count.favorites}
        commentCount={project._count.comments}
        initialFollowing={isFollowing}
      />

      <div className="flex flex-wrap items-center gap-2">
        <FavoriteButton projectId={project.id} />
        <CollectionButton projectId={project.id} />
        {session?.user && (
          <FollowButton targetType="PROJECT" targetId={project.id} initialFollowing={isFollowing} size="sm" />
        )}
        <ShareButton
          title={project.title}
          slug={project.slug}
          isCreator={isCreator}
          isAdmin={session?.user?.role === "ADMIN" || session?.user?.role === "MODERATOR"}
          geekhack={{
            status: project.status,
            designer: project.designer,
            descriptionHtml: project.description,
            images: project.images,
            links: project.links,
          }}
        />
        {session?.user && <ReportButton projectId={project.id} />}
        <ProjectAdminActions projectId={project.id} isCreator={isCreator} />
        {project.designer && (
          <>
            <span className="text-muted-foreground text-sm">by</span>
            <Badge variant="outline">
              {project.designer}
            </Badge>
          </>
        )}
      </div>

      <ProjectSpecs project={project} />

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="space-y-8 lg:col-span-2">
          <ProjectVendorsDisplay projectVendors={project.projectVendors} />
        </div>
        <div className="space-y-8">
          <ProjectTimeline project={project} />
          <ProjectChangeLog projectId={project.id} />
        </div>
      </div>

      {project.images.length > 0 && (
        <ProjectGallery images={project.images} />
      )}

      {(project.soundTests.length > 0 || project.category === "KEYBOARDS") && (
        <SoundTestSection
          projectId={project.id}
          soundTests={project.soundTests}
          canEdit={isCreator || session?.user?.role === "ADMIN" || session?.user?.role === "MODERATOR"}
        />
      )}

      <Separator />
      <UpdateTimeline projectId={project.id} creatorId={project.creatorId} />
      <Separator />
      <CommentSection projectId={project.id} />

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
    </div>
  );
}
