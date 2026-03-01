import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { validateForumContentSafety } from "@/lib/forums/anti-spam";
import { rateLimit, RATE_LIMIT_FORUM_POST_CREATE } from "@/lib/rate-limit";
import { dispatchNotification } from "@/lib/notifications/service";

const createPostSchema = z.object({
  content: z.string().min(1).max(50000),
  parentId: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = await rateLimit(session.user.id, "forum:create-post", RATE_LIMIT_FORUM_POST_CREATE);
  if (limited) return limited;

  const { threadId } = await params;
  const thread = await prisma.forumThread.findUnique({
    where: { id: threadId },
    select: { id: true, locked: true, authorId: true, title: true, slug: true, category: { select: { slug: true } } },
  });

  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  if (thread.locked) {
    return NextResponse.json({ error: "Thread is locked" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createPostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  }

  const { content, parentId } = parsed.data;

  const safetyCheck = await validateForumContentSafety(session.user.id, content, thread.title);
  if (safetyCheck) {
    return NextResponse.json(
      { error: safetyCheck.message, code: "FORUM_CONTENT_REJECTED" },
      { status: safetyCheck.status }
    );
  }

  const post = await prisma.forumPost.create({
    data: {
      content,
      threadId,
      authorId: session.user.id,
      parentId: parentId || null,
    },
  });

  const threadFollowers = await prisma.follow.findMany({
    where: {
      targetType: "FORUM_THREAD",
      targetId: thread.id,
    },
    select: { userId: true },
  });

  await dispatchNotification({
    recipients: [thread.authorId, ...threadFollowers.map((f) => f.userId)],
    actorId: session.user.id,
    preferenceType: "FORUM_REPLIES",
    notificationType: "FORUM_REPLY",
    title: "New thread reply",
    message: `${session.user.name || "Someone"} replied in \"${thread.title}\".`,
    link: `/forums/${thread.category.slug}/${thread.slug}`,
    emailSubject: `New reply in ${thread.title}`,
    emailHeading: "Someone replied to a thread you follow",
    emailCtaLabel: "Open thread",
  });

  return NextResponse.json(post, { status: 201 });
}
