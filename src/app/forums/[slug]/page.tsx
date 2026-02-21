import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Plus, Pin, Lock, MessageSquare, Eye } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { Metadata } from "next";
import { FollowButton } from "@/components/social/follow-button";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const category = await prisma.forumCategory.findUnique({
    where: { slug },
    select: { name: true, description: true },
  });
  if (!category) return { title: "Category Not Found" };
  return { title: category.name, description: category.description || undefined };
}

export default async function ForumCategoryPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const page = Number(sp.page ?? "1");
  const limit = 20;

  const category = await prisma.forumCategory.findUnique({
    where: { slug },
  });

  if (!category) notFound();

  const session = await auth();

  const isFollowingCategory = session?.user
    ? Boolean(
        await prisma.follow.findUnique({
          where: {
            userId_targetType_targetId: {
              userId: session.user.id,
              targetType: "FORUM_CATEGORY",
              targetId: category.id,
            },
          },
          select: { id: true },
        })
      )
    : false;

  const [threads, total] = await Promise.all([
    prisma.forumThread.findMany({
      where: { categoryId: category.id },
      include: {
        author: {
          select: { name: true, displayName: true, username: true, image: true },
        },
        _count: { select: { posts: true } },
      },
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.forumThread.count({ where: { categoryId: category.id } }),
  ]);

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6">
      <PageHeader title={category.name} description={category.description || undefined}>
        {session?.user && (
          <div className="flex items-center gap-2">
            <FollowButton
              targetType="FORUM_CATEGORY"
              targetId={category.id}
              initialFollowing={isFollowingCategory}
              size="sm"
            />
            <Button asChild>
              <Link href={`/forums/${slug}/new`}>
                <Plus className="mr-2 h-4 w-4" />
                New Thread
              </Link>
            </Button>
          </div>
        )}
      </PageHeader>

      <div className="space-y-2">
        {threads.length === 0 ? (
          <Card>
            <CardContent className="text-muted-foreground py-12 text-center">
              No threads yet. Be the first to start a discussion!
            </CardContent>
          </Card>
        ) : (
          threads.map((thread) => {
            const authorName =
              thread.author.displayName || thread.author.name || "Anonymous";
            const initials = authorName
              .split(" ")
              .map((n) => n[0])
              .join("")
              .toUpperCase()
              .slice(0, 2);

            return (
              <Link key={thread.id} href={`/forums/${slug}/${thread.slug}`}>
                <Card className="transition-colors hover:bg-muted/50">
                  <CardContent className="flex items-center gap-3 p-3">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={thread.author.image ?? undefined} />
                      <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {thread.pinned && <Pin className="h-3 w-3 text-amber-500" />}
                        {thread.locked && <Lock className="h-3 w-3 text-red-500" />}
                        <h3 className="truncate text-sm font-medium">{thread.title}</h3>
                      </div>
                      <p className="text-muted-foreground text-xs">
                        by {authorName} · {formatDistanceToNow(thread.createdAt, { addSuffix: true })}
                      </p>
                    </div>
                    <div className="text-muted-foreground flex items-center gap-4 text-xs">
                      <span className="flex items-center gap-1">
                        <MessageSquare className="h-3 w-3" />
                        {thread._count.posts}
                      </span>
                      <span className="flex items-center gap-1">
                        <Eye className="h-3 w-3" />
                        {thread.views}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          {page > 1 && (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/forums/${slug}?page=${page - 1}`}>Previous</Link>
            </Button>
          )}
          <span className="text-muted-foreground text-sm">
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/forums/${slug}?page=${page + 1}`}>Next</Link>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
