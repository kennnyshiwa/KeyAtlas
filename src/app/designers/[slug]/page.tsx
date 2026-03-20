import { notFound } from "next/navigation";
import Link from "next/link";
import Script from "next/script";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SmartImage } from "@/components/shared/smart-image";
import { ProjectGrid } from "@/components/projects/project-grid";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Palette, ExternalLink, Pencil } from "lucide-react";
import type { Metadata } from "next";
import { getSiteUrl, SITE_NAME } from "@/lib/site";

interface DesignerPageProps {
  params: Promise<{ slug: string }>;
}

async function getDesigner(slug: string) {
  return prisma.designer.findUnique({
    where: { slug },
    include: {
      projects: {
        where: { published: true },
        include: {
          vendor: { select: { name: true, slug: true } },
          _count: { select: { favorites: true } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });
}

export async function generateMetadata({
  params,
}: DesignerPageProps): Promise<Metadata> {
  const { slug } = await params;
  const designer = await getDesigner(slug);

  if (!designer) return { title: "Not Found" };

  const siteUrl = getSiteUrl();
  const canonical = new URL(`/designers/${designer.slug}`, siteUrl).toString();
  const description =
    designer.description?.trim() || `${designer.name} on ${SITE_NAME}`;
  const image = designer.logo || designer.banner || `${siteUrl}/window.svg`;

  return {
    title: designer.name,
    description,
    alternates: { canonical },
    openGraph: {
      title: designer.name,
      description,
      url: canonical,
      type: "profile",
      siteName: SITE_NAME,
      images: image ? [image] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: designer.name,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default async function DesignerPage({ params }: DesignerPageProps) {
  const { slug } = await params;
  const designer = await getDesigner(slug);

  if (!designer) {
    notFound();
  }

  const session = await auth();
  const canEdit =
    session?.user &&
    (["ADMIN", "MODERATOR"].includes(session.user.role) ||
      designer.ownerId === session.user.id);

  const siteUrl = getSiteUrl();
  const canonical = new URL(`/designers/${designer.slug}`, siteUrl).toString();
  const description =
    designer.description?.trim() || `${designer.name} on ${SITE_NAME}`;
  const image = designer.logo || designer.banner || `${siteUrl}/window.svg`;

  const jsonLd = JSON.parse(
    JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Person",
      name: designer.name,
      description,
      url: canonical,
      image,
      ...(designer.websiteUrl ? { sameAs: [designer.websiteUrl] } : {}),
    })
  );

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <Script
        id="designer-json-ld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {designer.banner && (
        <div className="bg-muted overflow-hidden rounded-xl border">
          <SmartImage
            src={designer.banner}
            alt={`${designer.name} banner`}
            width={1200}
            height={360}
            className="h-44 w-full object-cover sm:h-56"
          />
        </div>
      )}

      <div className="flex items-start gap-6">
        <div className="bg-muted flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-xl">
          {designer.logo ? (
            <SmartImage
              src={designer.logo}
              alt={designer.name}
              width={112}
              height={112}
              className="h-full w-full object-contain"
            />
          ) : (
            <Palette className="text-muted-foreground h-10 w-10" />
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold">{designer.name}</h1>
            <Badge variant="secondary">Designer</Badge>
          </div>

          {designer.description && (
            <p className="text-muted-foreground">{designer.description}</p>
          )}

          <div className="flex flex-wrap gap-2">
            {designer.websiteUrl && (
              <Button variant="outline" size="sm" asChild>
                <a
                  href={designer.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                  Visit Website
                </a>
              </Button>
            )}
            {canEdit && (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/designers/${designer.slug}/edit`}>
                  <Pencil className="mr-1.5 h-3.5 w-3.5" />
                  Edit Profile
                </Link>
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            Projects ({designer.projects.length})
          </h2>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/projects">Browse all projects</Link>
          </Button>
        </div>

        {designer.projects.length > 0 ? (
          <ProjectGrid projects={designer.projects} />
        ) : (
          <EmptyState
            title="No projects yet"
            description="This designer doesn't have any published projects yet."
          />
        )}
      </div>
    </div>
  );
}
