import { prisma } from "@/lib/prisma";

export const DELETED_USER_ID = "deleted-user";
export const DELETED_USER_USERNAME = "deleted-user";
export const DELETED_USER_NAME = "Deleted User";
export const DELETED_USER_BIO = "Deleted account placeholder for anonymized projects.";

export async function deleteUserAccount(userId: string) {
  await prisma.$transaction(async (tx) => {
    const deletedUser = await tx.user.upsert({
      where: { id: DELETED_USER_ID },
      update: {
        name: DELETED_USER_NAME,
        displayName: DELETED_USER_NAME,
        bio: DELETED_USER_BIO,
      },
      create: {
        id: DELETED_USER_ID,
        username: DELETED_USER_USERNAME,
        name: DELETED_USER_NAME,
        displayName: DELETED_USER_NAME,
        bio: DELETED_USER_BIO,
      },
      select: { id: true },
    });

    await tx.project.updateMany({
      where: { creatorId: userId },
      data: { creatorId: deletedUser.id },
    });

    await tx.follow.deleteMany({ where: { userId } });
    await tx.follow.deleteMany({ where: { targetUserId: userId } });
    await tx.favorite.deleteMany({ where: { userId } });
    await tx.userCollection.deleteMany({ where: { userId } });
    await tx.comment.deleteMany({ where: { userId } });
    await tx.forumPost.deleteMany({ where: { authorId: userId } });
    await tx.forumThread.deleteMany({ where: { authorId: userId } });
    await tx.notification.deleteMany({ where: { userId } });
    await tx.notificationPreference.deleteMany({ where: { userId } });
    await tx.pushDevice.deleteMany({ where: { userId } });
    await tx.savedFilter.deleteMany({ where: { userId } });
    await tx.apiKey.deleteMany({ where: { userId } });
    await tx.session.deleteMany({ where: { userId } });
    await tx.account.deleteMany({ where: { userId } });
    await tx.emailVerificationToken.deleteMany({ where: { userId } });
    await tx.passwordResetToken.deleteMany({ where: { userId } });
    await tx.imageAsset.deleteMany({ where: { uploaderId: userId } });
    await tx.adminAuditLog.deleteMany({ where: { actorId: userId } });
    await tx.projectReport.deleteMany({ where: { reporterId: userId } });
    await tx.projectChangeLog.deleteMany({ where: { actorId: userId } });
    await tx.buildGuide.deleteMany({ where: { authorId: userId } });
    await tx.vendorSuggestion.deleteMany({ where: { submittedById: userId } });

    await tx.user.delete({ where: { id: userId } });
  });
}
