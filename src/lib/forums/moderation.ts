import { prisma } from "@/lib/prisma";

export async function isModeratorUser(userId?: string | null) {
  if (!userId) return false;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  return user?.role === "ADMIN" || user?.role === "MODERATOR";
}
