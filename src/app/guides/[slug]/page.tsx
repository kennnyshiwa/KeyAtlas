import Link from "next/link";
import { notFound } from "next/navigation";
import Script from "next/script";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ShareButton } from "@/components/social/share-button";
import { DeleteGuideButton } from "@/components/guides/delete-guide-button";
import { RichTextRenderer } from "@/components/editor/rich-text-renderer";
import { ProjectGrid } from "@/components/projects/project-grid";
import { Calendar, Pencil } from "lucide-react";
import { SmartImage } from "@/components/shared/smart-image";
import type { Metadata } from "next";
import { getSiteUrl, SITE_NAME } from "@/lib/site";
import { stripHtml } from "@/lib/strip-html";

interface Props {
  params: Promise<{ slug: string }>;
}

function summarizeGuide(content: string | null | undefined, title: string) {
  const plain = content ? stripHtml(content) : "";
  return plain.slice(0, 160) || `${title} on ${SITE_NAME}`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const guide = await prisma.buildGuide.findUnique({
    where: { slug },
    select: { title: true, content: true, heroImage: true },
  });
  if (!guide) return { title: "Guide Not Found" };

  const siteUrl = getSiteUrl();
  const canonical = new URL(`/guides/${slug}`, siteUrl).toString();
  const description = summarizeGuide(guide.content, guide.title);
  const image = guide.heroImage || `${siteUrl}/window.svg`;

  return {
    title: guide.title,
    description,
    alternates: { canonical },
    openGraph: {
      title: guide.title,
      description,
      url: canonical,
      type: "article",
      siteName: SITE_NAME,
      images: image ? [image] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: guide.title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default async function GuidePage({ params }: Props) {
  const { slug } = await params;

  const guide = await prisma.buildGuide.findUnique({
    where: { slug, published: true },
    include: {
      author: {
        select: { name: true, displayName: true, username: true, image: true },
      },
    },
  });

  if (!guide) notFound();

  const session = await auth();
  const canEdit =
    !!session?.user &&
    (session.user.role === "ADMIN" || session.user.id === guide.authorId);
  const canDelete = canEdit;

  const [moreGuides, recentProjects] = await Promise.all([
    prisma.buildGuide.findMany({
      where: { published: true, NOT: { id: guide.id } },
      include: {
        author: {
          select: { name: true, displayName: true, username: true, image: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 3,
    }),
    prisma.project.findMany({
      where: { published: true },
      include: {
        vendor: { select: { name: true, slug: true } },
        _count: { select: { favorites: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 4,
    }),
  ]);

  const authorName =
    guide.author.displayName || guide.author.name || "Anonymous";
  const initials = authorName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const siteUrl = getSiteUrl();
  const canonical = new URL(`/guides/${guide.slug}`, siteUrl).toString();
  const description = summarizeGuide(guide.content, guide.title);
  const image = guide.heroImage || `${siteUrl}/window.svg`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: guide.title,
    description,
    author: { "@type": "Person", name: authorName },
    datePublished: guide.createdAt?.toISOString?.(),
    dateModified: guide.updatedAt?.toISOString?.(),
    image,
    url: canonical,
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Script
        id="guide-json-ld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <PageHeader title={guide.title}>
        <div className="flex items-center gap-2">
          <ShareButton title={guide.title} />
          {canEdit && (
            <Button asChild size="sm" variant="outline">
              <Link href={`/guides/${guide.slug}/edit`}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </Link>
            </Button>
          )}
          {canDelete && <DeleteGuideButton guideId={guide.id} />}
        </div>
      </PageHeader>

      <div className="flex items-center gap-3">
        <Avatar className="h-8 w-8">
          <AvatarImage src={guide.author.image ?? undefined} />
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <div>
          <p className="text-sm font-medium">{authorName}</p>
          <p className="text-muted-foreground flex items-center gap-1 text-xs">
            <Calendar className="h-3 w-3" />
            {new Date(guide.createdAt).toLocaleDateString()}
          </p>
        </div>
        {guide.difficulty && (
          <Badge variant="secondary" className="ml-auto">
            {guide.difficulty}
          </Badge>
        )}
      </div>

      {guide.heroImage && (
        <div className="relative aspect-[16/9] overflow-hidden rounded-lg">
          <SmartImage
            src={guide.heroImage}
            alt={guide.title}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 768px"
            priority
          />
        </div>
      )}

      <Card>
        <CardContent className="prose dark:prose-invert max-w-none p-6">
          <RichTextRenderer content={guide.content} />
        </CardContent>
      </Card>

      {moreGuides.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">More build guides</h2>
            <Button asChild variant="ghost" size="sm">
              <Link href="/guides">Browse all</Link>
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {moreGuides.map((item) => {
              const itemAuthor = item.author.displayName || item.author.name || "Anonymous";
              const itemInitials = itemAuthor
                .split(" ")
                .map((n) => n[0])
                .join("")
                .toUpperCase()
                .slice(0, 2);

              return (
                <Link key={item.id} href={`/guides/${item.slug}`}>
                  <Card className="group h-full overflow-hidden transition-shadow hover:shadow-lg">
                    {item.heroImage && (
                      <div className="relative aspect-[16/9] overflow-hidden">
                        <SmartImage
                          src={item.heroImage}
                          alt={item.title}
                          fill
                          className="object-cover transition-transform group-hover:scale-105"
                          sizes="(max-width: 768px) 100vw, 50vw"
                        />
                      </div>
                    )}
                    <CardContent className="space-y-2 p-4">
                      {item.difficulty && (
                        <Badge variant="secondary" className="text-xs">
                          {item.difficulty}
                        </Badge>
                      )}
                      <h3 className="line-clamp-2 font-semibold">{item.title}</h3>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Avatar className="h-5 w-5">
                          <AvatarImage src={item.author.image ?? undefined} />
                          <AvatarFallback className="text-[10px]">{itemInitials}</AvatarFallback>
                        </Avatar>
                        <span>{itemAuthor}</span>
                        <span>·</span>
                        <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <section className="space-y-3 rounded-lg border p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-semibold">Explore related projects</h3>
            <p className="text-muted-foreground text-sm">See what&apos;s launching and shipping across the community.</p>
          </div>
          <div className="flex gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href="/discover/group-buys">Group buys</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/discover/interest-checks">Interest checks</Link>
            </Button>
          </div>
        </div>
        {recentProjects.length > 0 ? (
          <ProjectGrid projects={recentProjects} />
        ) : (
          <p className="text-muted-foreground text-sm">
            Projects will appear here soon.
          </p>
        )}
      </section>
    </div>
  );
}
