import Link from "next/link";
import { SmartImage } from "@/components/shared/smart-image";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Plus, BookOpen } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Build Guides",
  description: "Keyboard build guides from the KeyAtlas community.",
  alternates: { canonical: "/guides" },
};

export default async function GuidesPage() {
  const session = await auth();

  const guides = await prisma.buildGuide.findMany({
    where: { published: true },
    include: {
      author: {
        select: { name: true, displayName: true, username: true, image: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Build Guides"
        description="Learn how to build, mod, and customize your keyboards."
      >
        {session?.user && (
          <Button asChild>
            <Link href="/guides/new">
              <Plus className="mr-2 h-4 w-4" />
              Write a Guide
            </Link>
          </Button>
        )}
      </PageHeader>

      {guides.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <BookOpen className="text-muted-foreground h-10 w-10" />
            <p className="text-muted-foreground">
              No build guides yet. Be the first to share your knowledge!
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {guides.map((guide) => {
            const authorName =
              guide.author.displayName || guide.author.name || "Anonymous";
            const initials = authorName
              .split(" ")
              .map((n) => n[0])
              .join("")
              .toUpperCase()
              .slice(0, 2);

            return (
              <Link key={guide.id} href={`/guides/${guide.slug}`}>
                <Card className="group h-full overflow-hidden transition-shadow hover:shadow-lg">
                  {guide.heroImage && (
                    <div className="relative aspect-[16/9] overflow-hidden">
                      <SmartImage
                        src={guide.heroImage}
                        alt={guide.title}
                        fill
                        className="object-cover transition-transform group-hover:scale-105"
                        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                      />
                    </div>
                  )}
                  <CardContent className="p-4">
                    {guide.difficulty && (
                      <Badge variant="secondary" className="mb-2 text-xs">
                        {guide.difficulty}
                      </Badge>
                    )}
                    <h3 className="mb-2 line-clamp-2 font-semibold">
                      {guide.title}
                    </h3>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-5 w-5">
                        <AvatarImage src={guide.author.image ?? undefined} />
                        <AvatarFallback className="text-[10px]">
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-muted-foreground text-xs">
                        {authorName} ·{" "}
                        {formatDistanceToNow(guide.createdAt, {
                          addSuffix: true,
                        })}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
