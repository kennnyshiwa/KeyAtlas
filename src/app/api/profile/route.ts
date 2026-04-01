import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const updateProfileSchema = z.object({
  displayName: z.string().max(50).optional().nullable(),
  username: z
    .string()
    .trim()
    .min(3)
    .max(30)
    .regex(/^[a-zA-Z0-9_-]+$/, "Username can only contain letters, numbers, hyphens, and underscores")
    .optional(),
  bio: z.string().max(500).optional().nullable(),
  image: z.string().url().optional().nullable(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      username: true,
      displayName: true,
      bio: true,
      email: true,
      image: true,
      role: true,
      createdAt: true,
    },
  });

  return NextResponse.json(user);
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = updateProfileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid data", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { username, displayName, bio, image } = parsed.data;
  const normalizedUsername = username?.toLowerCase();

  // Check username uniqueness
  if (normalizedUsername) {
    const existing = await prisma.user.findUnique({
      where: { username: normalizedUsername },
      select: { id: true },
    });
    if (existing && existing.id !== session.user.id) {
      return NextResponse.json(
        { error: "Username is already taken" },
        { status: 409 }
      );
    }
  }

  const updated = await prisma.user.update({
    where: { id: session.user.id },
    data: {
      ...(normalizedUsername !== undefined && { username: normalizedUsername }),
      ...(displayName !== undefined && { displayName }),
      ...(bio !== undefined && { bio }),
      ...(image !== undefined && { image }),
    },
    select: {
      id: true,
      name: true,
      username: true,
      displayName: true,
      bio: true,
      email: true,
      image: true,
      role: true,
      createdAt: true,
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  const userId = session.user.id;

  await prisma.$transaction(async (tx) => {
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

    // Anonymize projects (preserve community data, remove ownership)
    await tx.$executeRaw`UPDATE projects SET "creatorId" = NULL WHERE "creatorId" = ${userId}`;

    await tx.user.delete({ where: { id: userId } });
  });

  return NextResponse.json({ message: "Account successfully deleted." });
}
