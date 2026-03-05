import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isModeratorUser } from "@/lib/forums/moderation";
import { logAdminAction } from "@/lib/admin-audit";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const canModerate = await isModeratorUser(session.user.id);
  if (!canModerate) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { threadId } = await params;
  const thread = await prisma.forumThread.findUnique({
    where: { id: threadId },
    select: { id: true },
  });

  if (!thread) return NextResponse.json({ error: "Thread not found" }, { status: 404 });

  const body = await req.json();
  const action = body?.action as "lock" | "unlock" | "pin" | "unpin" | undefined;

  let data: { locked?: boolean; pinned?: boolean } | null = null;
  if (action === "lock") data = { locked: true };
  if (action === "unlock") data = { locked: false };
  if (action === "pin") data = { pinned: true };
  if (action === "unpin") data = { pinned: false };

  if (!data) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const updated = await prisma.forumThread.update({
    where: { id: threadId },
    data,
  });

  await logAdminAction({
    actorId: session.user.id,
    actorRole: session.user.role,
    action: `FORUM_THREAD_${action?.toUpperCase()}`,
    resource: "FORUM_THREAD",
    resourceId: threadId,
    targetId: threadId,
    metadata: data,
    ipAddress: req.headers.get("x-forwarded-for"),
    userAgent: req.headers.get("user-agent"),
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const canModerate = await isModeratorUser(session.user.id);
  if (!canModerate) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { threadId } = await params;
  const existing = await prisma.forumThread.findUnique({
    where: { id: threadId },
    select: { id: true, category: { select: { slug: true } } },
  });

  if (!existing) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  await prisma.forumPost.deleteMany({ where: { threadId } });
  await prisma.forumThread.delete({ where: { id: threadId } });

  await logAdminAction({
    actorId: session.user.id,
    actorRole: session.user.role,
    action: "FORUM_THREAD_DELETED",
    resource: "FORUM_THREAD",
    resourceId: threadId,
    targetId: threadId,
    ipAddress: req.headers.get("x-forwarded-for"),
    userAgent: req.headers.get("user-agent"),
  });

  return NextResponse.json({ success: true, categorySlug: existing.category.slug });
}
