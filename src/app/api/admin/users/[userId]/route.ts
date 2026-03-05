import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdmin, requireAdminSession } from "@/lib/admin-auth";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const access = await requireAdminSession();
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

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const access = await requireAdminSession();
  if (!access.ok) {
    return NextResponse.json({ error: access.error, message: access.message }, { status: access.status });
  }

  if (!isAdmin(access.session.user.role)) {
    return NextResponse.json({ error: "FORBIDDEN", message: "Admin role required" }, { status: 403 });
  }

  const { userId } = await params;

  if (userId === access.session.user.id) {
    return NextResponse.json({ error: "INVALID_ACTION", message: "Cannot delete your own account" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
  if (!target) {
    return NextResponse.json({ error: "NOT_FOUND", message: "User not found" }, { status: 404 });
  }

  if (target.role === "ADMIN") {
    const otherAdminCount = await prisma.user.count({
      where: {
        role: "ADMIN",
        bannedAt: null,
        id: { not: userId },
      },
    });

    if (otherAdminCount < 1) {
      return NextResponse.json(
        { error: "INVALID_ACTION", message: "Cannot delete the last active admin" },
        { status: 400 }
      );
    }
  }

  await prisma.user.delete({ where: { id: userId } });

  return NextResponse.json({ data: { id: userId, deleted: true } });
}
