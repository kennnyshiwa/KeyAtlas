import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { rateLimit, RATE_LIMIT_KEY_MGMT } from "@/lib/rate-limit";

/**
 * PATCH /api/v1/users/me
 * Update the authenticated user's profile (username, bio, displayName).
 */
export async function PATCH(req: NextRequest) {
  const user = await authenticateApiKey(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = await rateLimit(user.id, "v1:users:me:patch", RATE_LIMIT_KEY_MGMT);
  if (limited) return limited;

  let body: { username?: string; bio?: string; displayName?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { username, bio, displayName } = body;

  // Validate username if provided
  if (username !== undefined) {
    if (typeof username !== "string" || username.length < 3 || username.length > 30) {
      return NextResponse.json(
        { error: "Username must be between 3 and 30 characters" },
        { status: 400 }
      );
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      return NextResponse.json(
        { error: "Username may only contain letters, numbers, hyphens, and underscores" },
        { status: 400 }
      );
    }
    // Check uniqueness
    const existing = await prisma.user.findFirst({
      where: { username, NOT: { id: user.id } },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json({ error: "Username already taken" }, { status: 409 });
    }
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      ...(username !== undefined && { username }),
      ...(bio !== undefined && { bio }),
      ...(displayName !== undefined && { displayName }),
    },
    select: {
      id: true,
      username: true,
      displayName: true,
      bio: true,
      image: true,
      email: true,
      role: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ data: updated });
}

/**
 * DELETE /api/v1/users/me
 * Permanently delete the authenticated user's account and all associated data.
 * Requires body: { "confirmation": "DELETE" }
 */
export async function DELETE(req: NextRequest) {
  const user = await authenticateApiKey(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = await rateLimit(user.id, "v1:users:me:delete", RATE_LIMIT_KEY_MGMT);
  if (limited) return limited;

  let body: { confirmation?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.confirmation !== "DELETE") {
    return NextResponse.json(
      { error: 'Confirmation required. Send { "confirmation": "DELETE" } to proceed.' },
      { status: 400 }
    );
  }

  // Delete everything in a transaction. Many relations use onDelete: Cascade so
  // deleting the user record at the end will handle those automatically, but we
  // explicitly clean up the non-cascade or sensitive ones first for clarity and
  // to avoid FK constraint ordering issues.
  await prisma.$transaction(async (tx) => {
    // Anonymize projects (preserve community data, remove ownership)
    await tx.project.updateMany({
      where: { creatorId: user.id },
      data: { creatorId: user.id }, // will be handled by SetNull after user delete
    });

    // Delete cascade relations that need explicit ordering
    await tx.follow.deleteMany({ where: { userId: user.id } });
    await tx.follow.deleteMany({ where: { targetUserId: user.id } });
    await tx.favorite.deleteMany({ where: { userId: user.id } });
    await tx.userCollection.deleteMany({ where: { userId: user.id } });
    await tx.comment.deleteMany({ where: { userId: user.id } });
    await tx.forumPost.deleteMany({ where: { authorId: user.id } });
    await tx.forumThread.deleteMany({ where: { authorId: user.id } });
    await tx.notification.deleteMany({ where: { userId: user.id } });
    await tx.notificationPreference.deleteMany({ where: { userId: user.id } });
    await tx.pushDevice.deleteMany({ where: { userId: user.id } });
    await tx.savedFilter.deleteMany({ where: { userId: user.id } });
    await tx.apiKey.deleteMany({ where: { userId: user.id } });
    await tx.session.deleteMany({ where: { userId: user.id } });
    await tx.account.deleteMany({ where: { userId: user.id } });
    await tx.emailVerificationToken.deleteMany({ where: { userId: user.id } });
    await tx.passwordResetToken.deleteMany({ where: { userId: user.id } });
    await tx.imageAsset.deleteMany({ where: { uploaderId: user.id } });
    await tx.adminAuditLog.deleteMany({ where: { actorId: user.id } });
    await tx.projectReport.deleteMany({ where: { reporterId: user.id } });
    await tx.projectChangeLog.deleteMany({ where: { actorId: user.id } });
    await tx.buildGuide.deleteMany({ where: { authorId: user.id } });
    await tx.vendorSuggestion.deleteMany({ where: { submittedById: user.id } });

    // Anonymize projects — set creatorId to null via SetNull is handled by Prisma schema
    // For projects with creatorId pointing to this user, we need to reassign or the FK
    // will block deletion. The schema uses onDelete: Cascade for projects, so we need to
    // handle this differently — we'll unlink by updating to a sentinel value or let cascade
    // delete the projects. Per the task spec: anonymize (don't delete projects).
    // Since the schema has `creator User @relation ... onDelete: Cascade`, we must
    // either change to SetNull or handle here. We'll use a raw update to null before deletion.
    await tx.$executeRaw`UPDATE projects SET "creatorId" = NULL WHERE "creatorId" = ${user.id}`;

    // Finally delete the user record
    await tx.user.delete({ where: { id: user.id } });
  });

  return NextResponse.json(
    { message: "Account successfully deleted." },
    { status: 200 }
  );
}
