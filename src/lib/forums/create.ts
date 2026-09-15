import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requestIdentity } from "@/lib/users/request-identity";
import { auth } from "@/lib/auth";
import { validateForumContentSafety } from "./anti-spam";
import { stageNotification } from "@/lib/notifications/service";
import { rateLimit, RATE_LIMIT_FORUM_THREAD_CREATE, RATE_LIMIT_FORUM_POST_CREATE } from "@/lib/rate-limit";

const text = z.string().min(1).max(50000).refine((value) => value.trim().length > 0);
const threadSchema = z.object({ title: z.string().min(3).max(200).refine((value) => value.trim().length >= 3), content: text });
const postSchema = z.object({ content: text, parentId: z.string().min(1).optional(), parent_id: z.string().min(1).optional() })
  .refine((value) => !value.parentId || !value.parent_id || value.parentId === value.parent_id);
const authorSelect = { id: true, username: true, image: true } as const;
class ForumError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
const failure = (error: unknown) => {
  if (error instanceof ForumError) return NextResponse.json({ error: error.message }, { status: error.status });
  throw error;
};
async function identity(req: NextRequest, web: boolean) {
  return web ? (await auth())?.user : requestIdentity(req);
}
async function body(req: NextRequest) {
  try { return await req.json(); }
  catch { throw new ForumError("Invalid JSON body", 400); }
}
function rejected(check: { status: number; message: string }) {
  return NextResponse.json({ error: check.message, code: "FORUM_CONTENT_REJECTED" }, { status: check.status });
}

/** All three create paths share guards, quota and one atomic content/notification event. */
export async function createForumThread(req: NextRequest, categorySlug?: string, web = false) {
  try {
    const user = await identity(req, web);
    if (!user?.id) throw new ForumError("Unauthorized", 401);
    const limited = await rateLimit(user.id, "forum:create-thread", RATE_LIMIT_FORUM_THREAD_CREATE);
    if (limited) return limited;
    const input = await body(req);
    const parsed = threadSchema.safeParse(input);
    if (!parsed.success) throw new ForumError("Invalid data", 400);
    if (categorySlug === undefined && (typeof input.category_id !== "string" || !input.category_id)) throw new ForumError("Category is required", 400);
    const category = await prisma.forumCategory.findUnique({
      where: categorySlug === undefined ? { id: input.category_id } : { slug: categorySlug },
      select: { id: true, slug: true, name: true },
    });
    if (!category) throw new ForumError("Category not found", 404);
    const title = web ? parsed.data.title : parsed.data.title.trim();
    const content = web ? parsed.data.content : parsed.data.content.trim();
    const safety = await validateForumContentSafety(user.id, content, title);
    if (safety) return rejected(safety);
    const baseSlug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100) || "thread";
    // A unique check alone races. Serialize slug allocation across ALL creation paths (including overlapping suffix families).
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended('forum-thread-slug', 0))::text`;
      let slug = baseSlug;
      let counter = 0;
      while (await tx.forumThread.findUnique({ where: { slug }, select: { id: true } })) slug = `${baseSlug}-${++counter}`;
      const thread = await tx.forumThread.create({ data: { title, content, slug, categoryId: category.id, authorId: user.id } });
      const followers = await tx.follow.findMany({ where: { targetType: "FORUM_CATEGORY", targetId: category.id }, select: { userId: true } });
      const deliver = await stageNotification({
        recipients: followers.map((f) => f.userId), actorId: user.id,
        preferenceType: "FORUM_CATEGORY_THREADS", notificationType: "NEW_FORUM_THREAD",
        title: "New thread in followed category", message: `${user.name || "Someone"} posted "${title}" in ${category.name}.`,
        link: `/forums/${category.slug}/${thread.slug}`, metadata: { threadId: thread.id },
        emailSubject: `New KeyAtlas forum thread: ${title}`, emailHeading: `New thread in ${category.name}`, emailCtaLabel: "View thread",
      }, tx);
      return { thread, deliver };
    });
    await result.deliver();
    return NextResponse.json(web ? result.thread : { data: result.thread }, { status: 201 });
  } catch (error) { return failure(error); }
}

export async function createForumPost(req: NextRequest, threadId: string, web = false) {
  try {
    const user = await identity(req, web);
    if (!user?.id) throw new ForumError("Unauthorized", 401);
    const limited = await rateLimit(user.id, "forum:create-post", RATE_LIMIT_FORUM_POST_CREATE);
    if (limited) return limited;
    const parsed = postSchema.safeParse(await body(req));
    if (!parsed.success) throw new ForumError("Invalid data", 400);
    const content = web ? parsed.data.content : parsed.data.content.trim();
    const parentId = parsed.data.parentId ?? parsed.data.parent_id;
    const result = await prisma.$transaction(async (tx) => {
      // Lock the same row moderation updates: a concurrent lock/delete must settle before validation.
      await tx.$queryRaw`SELECT id FROM forum_threads WHERE id = ${threadId} FOR UPDATE`;
      const thread = await tx.forumThread.findUnique({ where: { id: threadId }, select: {
        id: true, locked: true, authorId: true, title: true, slug: true, category: { select: { slug: true } },
      } });
      if (!thread) throw new ForumError("Thread not found", 404);
      if (thread.locked) throw new ForumError("Thread is locked", 403);
      if (parentId) {
        const parents = await tx.$queryRaw<{ threadId: string }[]>`SELECT "threadId" FROM forum_posts WHERE id = ${parentId} FOR KEY SHARE`;
        if (parents[0]?.threadId !== threadId) throw new ForumError("Parent post must exist in this thread", 400);
      }
      const safety = await validateForumContentSafety(user.id, content, thread.title);
      if (safety) return { safety };
      const post = await tx.forumPost.create({ data: { content, threadId, authorId: user.id, parentId: parentId ?? null }, ...(web ? {} : { include: { author: { select: authorSelect } } }) });
      const followers = await tx.follow.findMany({ where: { targetType: "FORUM_THREAD", targetId: thread.id }, select: { userId: true } });
      const deliver = await stageNotification({
        recipients: [thread.authorId, ...followers.map((f) => f.userId)], actorId: user.id,
        preferenceType: "FORUM_REPLIES", notificationType: "FORUM_REPLY",
        title: "New thread reply", message: `${user.name || "Someone"} replied in "${thread.title}".`,
        link: `/forums/${thread.category.slug}/${thread.slug}`, metadata: { threadId, postId: post.id },
        emailSubject: `New reply in ${thread.title}`, emailHeading: "Someone replied to a thread you follow", emailCtaLabel: "Open thread",
      }, tx);
      return { post, deliver };
    });
    if (result.safety) return rejected(result.safety);
    await result.deliver!();
    return NextResponse.json(web ? result.post : { data: result.post }, { status: 201 });
  } catch (error) { return failure(error); }
}
