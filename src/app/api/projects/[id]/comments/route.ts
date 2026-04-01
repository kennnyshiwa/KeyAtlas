import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { commentFormSchema } from "@/lib/validations/comment";
import { dispatchNotification } from "@/lib/notifications/service";
import { rateLimit, RATE_LIMIT_COMMENT_CREATE } from "@/lib/rate-limit";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const comments = await prisma.comment.findMany({
    where: { projectId: id, parentId: null },
    include: {
      user: { select: { id: true, name: true, image: true } },
      replies: {
        include: {
          user: { select: { id: true, name: true, image: true } },
          replies: {
            include: {
              user: { select: { id: true, name: true, image: true } },
            },
            orderBy: { createdAt: "asc" },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(comments);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const limited = await rateLimit(session.user.id, "comments:create", RATE_LIMIT_COMMENT_CREATE);
  if (limited) return limited;

  const { id } = await params;
  const body = await req.json();
  const result = commentFormSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: result.error.issues },
      { status: 400 }
    );
  }

  const project = await prisma.project.findUnique({
    where: { id },
    select: { id: true, slug: true, title: true },
  });

  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const parentComment = result.data.parentId
    ? await prisma.comment.findUnique({ where: { id: result.data.parentId }, select: { userId: true } })
    : null;

  const comment = await prisma.comment.create({
    data: {
      content: result.data.content,
      parentId: result.data.parentId ?? null,
      userId: session.user.id,
      projectId: id,
    },
    include: {
      user: { select: { id: true, name: true, image: true } },
    },
  });

  const followers = await prisma.follow.findMany({
    where: { targetType: "PROJECT", targetId: project.id },
    select: { userId: true },
  });

  await dispatchNotification({
    recipients: [parentComment?.userId || "", ...followers.map((f) => f.userId)],
    actorId: session.user.id,
    preferenceType: "PROJECT_COMMENTS",
    notificationType: parentComment ? "COMMENT_REPLY" : "NEW_COMMENT",
    title: parentComment ? "New reply on project comment" : "New project comment",
    message: `${session.user.name || "Someone"} commented on ${project.title}.`,
    link: `/projects/${project.slug}`,
    emailSubject: `New comment on ${project.title}`,
    emailHeading: `New activity on ${project.title}`,
    emailCtaLabel: "View comments",
  });

  // Extract mentioned usernames from comment HTML
  const mentionRegex = /data-mention="([^"]+)"/g;
  const mentionedUsernames: string[] = [];
  let mentionMatch;
  while ((mentionMatch = mentionRegex.exec(result.data.content)) !== null) {
    mentionedUsernames.push(mentionMatch[1]);
  }

  if (mentionedUsernames.length > 0) {
    const mentionedUsers = await prisma.user.findMany({
      where: { username: { in: mentionedUsernames } },
      select: { id: true },
    });

    // Filter out the comment author and anyone already getting notified
    const existingRecipients = new Set([
      session.user.id,
      parentComment?.userId || "",
      ...followers.map((f) => f.userId),
    ]);

    const mentionRecipients = mentionedUsers
      .map((u) => u.id)
      .filter((id) => !existingRecipients.has(id));

    if (mentionRecipients.length > 0) {
      await dispatchNotification({
        recipients: mentionRecipients,
        actorId: session.user.id,
        preferenceType: "PROJECT_COMMENTS",
        notificationType: "COMMENT_REPLY",
        title: "You were mentioned in a comment",
        message: `${session.user.name || "Someone"} mentioned you in a comment on ${project.title}.`,
        link: `/projects/${project.slug}`,
        emailSubject: `You were mentioned on ${project.title}`,
        emailHeading: `${session.user.name || "Someone"} mentioned you`,
        emailCtaLabel: "View comment",
      });
    }
  }

  return NextResponse.json(comment, { status: 201 });
}
