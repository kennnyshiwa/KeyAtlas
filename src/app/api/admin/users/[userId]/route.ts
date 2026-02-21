import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/admin-auth";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const access = await requireAdminSession({ allowModeratorReadOnly: true });
  if (!access.ok) {
    return NextResponse.json({ error: access.error, message: access.message }, { status: access.status });
  }

  const { userId } = await params;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      displayName: true,
      username: true,
      role: true,
      createdAt: true,
      lastSeenAt: true,
      emailVerified: true,
      bannedAt: true,
      banReason: true,
      forcePasswordReset: true,
      _count: {
        select: {
          projects: true,
          comments: true,
          forumPosts: true,
        },
      },
    },
  });

  if (!user) {
    return NextResponse.json({ error: "NOT_FOUND", message: "User not found" }, { status: 404 });
  }

  return NextResponse.json({ data: user });
}
