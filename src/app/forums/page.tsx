import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Pin } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Forums",
  description: "KeyAtlas community forums — discuss keyboards, keycaps, and more.",
  alternates: { canonical: "/forums" },
};

export default async function ForumsPage() {
  const categories = await prisma.forumCategory.findMany({
    orderBy: { order: "asc" },
    include: {
      threads: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: {
          author: { select: { name: true, displayName: true, username: true, image: true } },
          _count: { select: { posts: true } },
        },
      },
      _count: { select: { threads: true } },
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Forums"
        description="Join the discussion. Ask questions, share builds, and connect with the community."
      />

      <div className="space-y-4">
        {categories.length === 0 ? (
          <Card>
            <CardContent className="text-muted-foreground py-12 text-center">
              No forum categories yet. Check back soon!
            </CardContent>
          </Card>
        ) : (
          categories.map((category) => {
            const latestThread = category.threads[0];
            return (
              <Link key={category.id} href={`/forums/${category.slug}`}>
                <Card className="transition-shadow hover:shadow-md">
                  <CardContent className="flex items-center gap-4 p-4">
                    <div className="bg-primary/10 flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg">
                      <MessageSquare className="text-primary h-6 w-6" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{category.name}</h3>
                        <Badge variant="secondary" className="text-xs">
                          {category._count.threads} threads
                        </Badge>
                      </div>
                      {category.description && (
                        <p className="text-muted-foreground line-clamp-1 text-sm">
                          {category.description}
                        </p>
                      )}
                    </div>
                    {latestThread && (
                      <div className="hidden text-right text-sm lg:block">
                        <p className="line-clamp-1 font-medium">{latestThread.title}</p>
                        <p className="text-muted-foreground text-xs">
                          by {latestThread.author.displayName || latestThread.author.name || "Anonymous"}{" "}
                          · {formatDistanceToNow(latestThread.createdAt, { addSuffix: true })}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
