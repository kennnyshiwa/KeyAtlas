import type { FollowTargetType } from "@/generated/prisma/client";
import type { prisma } from "@/lib/prisma";

type PrismaLike = typeof prisma;

export async function followTargetExists(db: PrismaLike, targetType: FollowTargetType, targetId: string) {
  if (targetType === "USER") {
    return Boolean(await db.user.findUnique({ where: { id: targetId }, select: { id: true } }));
  }

  if (targetType === "PROJECT") {
    return Boolean(await db.project.findUnique({ where: { id: targetId }, select: { id: true } }));
  }

  if (targetType === "VENDOR") {
    return Boolean(await db.vendor.findUnique({ where: { id: targetId }, select: { id: true } }));
  }

  if (targetType === "FORUM_THREAD") {
    return Boolean(await db.forumThread.findUnique({ where: { id: targetId }, select: { id: true } }));
  }

  return Boolean(await db.forumCategory.findUnique({ where: { id: targetId }, select: { id: true } }));
}
