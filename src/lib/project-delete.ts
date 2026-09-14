import { prisma } from "@/lib/prisma";

/** Delete first, with the authorization predicate on the write itself. PostgreSQL
 * rechecks it after waiting on a concurrent publish/ownership update. Cascading
 * relations and the two legacy non-FK references are removed atomically. */
export async function deleteProjectRecord(
  id: string,
  guard: { unpublishedOnly: boolean; creatorId?: string },
) {
  return prisma.$transaction(async (tx) => {
    const deleted = await tx.project.deleteMany({
      where: {
        id,
        ...(guard.unpublishedOnly ? { published: false } : {}),
        ...(guard.creatorId ? { creatorId: guard.creatorId } : {}),
      },
    });
    if (!deleted.count) return false;
    await tx.follow.deleteMany({ where: { targetType: "PROJECT", targetId: id } });
    await tx.watchlistNotification.deleteMany({ where: { projectId: id } });
    return true;
  });
}
