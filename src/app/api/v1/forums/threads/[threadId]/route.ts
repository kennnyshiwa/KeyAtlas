import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { rateLimit, RATE_LIMIT_DETAIL } from "@/lib/rate-limit";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const user = await authenticateApiKey(req).catch(() => null);
  const rateLimitKey = user?.id ?? (req.headers.get("x-forwarded-for") ?? "anon");
  const limited = await rateLimit(rateLimitKey, "v1:forums:thread-detail", RATE_LIMIT_DETAIL);
  if (limited) return limited;

  const { threadId } = await params;

  const thread = await prisma.forumThread.findUnique({
    where: { id: threadId },
    select: {
      id: true,
      title: true,
      slug: true,
      content: true,
      categoryId: true,
      createdAt: true,
      updatedAt: true,
      pinned: true,
      locked: true,
      author: { select: { id: true, username: true, name: true, displayName: true, image: true } },
      posts: {
        select: {
          id: true,
          content: true,
          createdAt: true,
          updatedAt: true,
          threadId: true,
          parentId: true,
          author: { select: { id: true, username: true, name: true, displayName: true, image: true } },
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      },
      _count: { select: { posts: true } },
    },
  });

  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  return NextResponse.json({
    data: {
      id: thread.id,
      title: thread.title,
      slug: thread.slug,
      content: thread.content,
      category_id: thread.categoryId,
      author: thread.author
        ? {
            id: thread.author.id,
            username: thread.author.username,
            name: thread.author.displayName ?? thread.author.name,
            image: thread.author.image,
          }
        : null,
      post_count: thread._count.posts,
      is_pinned: thread.pinned,
      is_locked: thread.locked,
      created_at: thread.createdAt,
      updated_at: thread.updatedAt,
      posts: thread.posts.map((post) => ({
        id: post.id,
        content: post.content,
        thread_id: post.threadId,
        parent_id: post.parentId,
        created_at: post.createdAt,
        updated_at: post.updatedAt,
        author: post.author
          ? {
              id: post.author.id,
              username: post.author.username,
              name: post.author.displayName ?? post.author.name,
              image: post.author.image,
            }
          : null,
      })),
    },
  });
}
