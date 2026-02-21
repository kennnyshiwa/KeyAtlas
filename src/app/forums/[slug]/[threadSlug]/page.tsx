import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Pin, Lock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ForumPostForm } from "@/components/forums/forum-post-form";
import { RichTextRenderer } from "@/components/editor/rich-text-renderer";
import { ThreadModerationActions } from "@/components/forums/thread-moderation-actions";
import { ForumPostAdminActions } from "@/components/forums/forum-post-admin-actions";
import type { Metadata } from "next";
import { FollowButton } from "@/components/social/follow-button";

interface Props {
  params: Promise<{ slug: string; threadSlug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { threadSlug } = await params;
  const thread = await prisma.forumThread.findUnique({
    where: { slug: threadSlug },
    select: { title: true },
  });
  if (!thread) return { title: "Thread Not Found" };
  return { title: thread.title };
}

export default async function ThreadPage({ params }: Props) {
  const { slug, threadSlug } = await params;

  const thread = await prisma.forumThread.findUnique({
    where: { slug: threadSlug },
    include: {
      author: {
        select: { id: true, name: true, displayName: true, username: true, image: true },
      },
      category: { select: { name: true, slug: true } },
      posts: {
        where: { parentId: null },
        include: {
          author: {
            select: { id: true, name: true, displayName: true, username: true, image: true },
          },
          replies: {
            include: {
              author: {
                select: { id: true, name: true, displayName: true, username: true, image: true },
              },
            },
            orderBy: { createdAt: "asc" },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!thread) notFound();

  // Increment views
  await prisma.forumThread.update({
    where: { id: thread.id },
    data: { views: { increment: 1 } },
  });

  const session = await auth();
  const isModerator = !!(session?.user && ["ADMIN", "MODERATOR"].includes(session.user.role));
  const isFollowingThread = session?.user
    ? Boolean(
        await prisma.follow.findUnique({
          where: {
            userId_targetType_targetId: {
              userId: session.user.id,
              targetType: "FORUM_THREAD",
              targetId: thread.id,
            },
          },
          select: { id: true },
        })
      )
    : false;

  const authorName = (user: { displayName: string | null; name: string | null }) =>
    user.displayName || user.name || "Anonymous";

  const authorInitials = (user: { displayName: string | null; name: string | null }) =>
    (authorName(user))
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

  return (
    <div className="space-y-6">
      <PageHeader title={thread.title}>
        <div className="flex flex-wrap items-center gap-2">
          {thread.pinned && (
            <Badge variant="secondary">
              <Pin className="mr-1 h-3 w-3" /> Pinned
            </Badge>
          )}
          {thread.locked && (
            <Badge variant="destructive">
              <Lock className="mr-1 h-3 w-3" /> Locked
            </Badge>
          )}
          {session?.user && (
            <FollowButton
              targetType="FORUM_THREAD"
              targetId={thread.id}
              initialFollowing={isFollowingThread}
              size="sm"
            />
          )}
          {isModerator && (
            <ThreadModerationActions
              threadId={thread.id}
              categorySlug={thread.category.slug}
              locked={thread.locked}
              pinned={thread.pinned}
            />
          )}
        </div>
      </PageHeader>

      {/* Original Post */}
      <Card>
        <CardContent className="p-4">
          <div className="mb-3 flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarImage src={thread.author.image ?? undefined} />
              <AvatarFallback>{authorInitials(thread.author)}</AvatarFallback>
            </Avatar>
            <div>
              <p className="font-medium">{authorName(thread.author)}</p>
              <p className="text-muted-foreground text-xs">
                {formatDistanceToNow(thread.createdAt, { addSuffix: true })}
              </p>
            </div>
          </div>
          <div className="prose dark:prose-invert max-w-none">
            <RichTextRenderer content={thread.content} />
          </div>
        </CardContent>
      </Card>

      {/* Replies */}
      {thread.posts.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold">
            {thread.posts.length} {thread.posts.length === 1 ? "Reply" : "Replies"}
          </h3>
          {thread.posts.map((post) => (
            <div key={post.id}>
              <Card>
                <CardContent className="p-4">
                  <div className="mb-2 flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={post.author.image ?? undefined} />
                      <AvatarFallback className="text-xs">
                        {authorInitials(post.author)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium">{authorName(post.author)}</p>
                      <p className="text-muted-foreground text-xs">
                        {formatDistanceToNow(post.createdAt, { addSuffix: true })}
                      </p>
                    </div>
                    {isModerator && (
                      <div className="ml-auto">
                        <ForumPostAdminActions postId={post.id} />
                      </div>
                    )}
                  </div>
                  <div className="prose dark:prose-invert max-w-none text-sm">
                    <RichTextRenderer content={post.content} />
                  </div>

                  {/* Nested replies */}
                  {post.replies.length > 0 && (
                    <div className="mt-3 space-y-2 border-l-2 pl-4">
                      {post.replies.map((reply) => (
                        <div key={reply.id} className="flex gap-2">
                          <Avatar className="h-6 w-6">
                            <AvatarImage src={reply.author.image ?? undefined} />
                            <AvatarFallback className="text-xs">
                              {authorInitials(reply.author)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs">
                              <span className="font-medium">{authorName(reply.author)}</span>
                              <span className="text-muted-foreground ml-2">
                                {formatDistanceToNow(reply.createdAt, { addSuffix: true })}
                              </span>
                            </p>
                            <div className="prose dark:prose-invert max-w-none text-sm">
                              <RichTextRenderer content={reply.content} />
                            </div>
                          </div>
                          {isModerator && (
                            <div className="ml-auto">
                              <ForumPostAdminActions postId={reply.id} />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      )}

      {/* Reply Form */}
      {session?.user && !thread.locked && (
        <ForumPostForm threadId={thread.id} categorySlug={slug} threadSlug={threadSlug} />
      )}

      {thread.locked && (
        <Card>
          <CardContent className="text-muted-foreground py-6 text-center text-sm">
            This thread is locked. No new replies can be posted.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
