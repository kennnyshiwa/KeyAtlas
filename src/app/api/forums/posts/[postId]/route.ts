import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isModeratorUser } from "@/lib/forums/moderation";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const canModerate = await isModeratorUser(session.user.id);
  if (!canModerate) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { postId } = await params;
  const post = await prisma.forumPost.findUnique({
    where: { id: postId },
    select: { id: true, threadId: true },
  });

  if (!post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  await prisma.forumPost.deleteMany({
    where: {
      OR: [{ id: postId }, { parentId: postId }],
    },
  });

  return NextResponse.json({ success: true, threadId: post.threadId });
}
