import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { dispatchNotification } from "@/lib/notifications/service";
import { followTargetExists } from "@/lib/follow/targets";
import { rateLimit, RATE_LIMIT_FOLLOW } from "@/lib/rate-limit";

const followSchema = z.object({
  targetType: z.enum(["USER", "PROJECT", "VENDOR", "FORUM_THREAD", "FORUM_CATEGORY"]),
  targetId: z.string().trim().min(1).max(191),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = rateLimit(session.user.id, "follow", RATE_LIMIT_FOLLOW);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body", code: "INVALID_JSON" }, { status: 400 });
  }

  const parsed = followSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid data", code: "INVALID_REQUEST", details: parsed.error.flatten() }, { status: 400 });
  }

  const { targetType, targetId } = parsed.data;
  if (targetType === "USER" && targetId === session.user.id) {
    return NextResponse.json({ error: "Cannot follow yourself" }, { status: 400 });
  }

  const targetExists = await followTargetExists(prisma, targetType, targetId);

  if (!targetExists) {
    return NextResponse.json({ error: "Target not found", code: "TARGET_NOT_FOUND" }, { status: 404 });
  }

  const relationData: Record<string, string> = {};
  if (targetType === "USER") relationData.targetUserId = targetId;
  else if (targetType === "PROJECT") relationData.targetProjectId = targetId;
  else if (targetType === "VENDOR") relationData.targetVendorId = targetId;

  const existing = await prisma.follow.findUnique({
    where: {
      userId_targetType_targetId: {
        userId: session.user.id,
        targetType,
        targetId,
      },
    },
  });

  if (existing) {
    await prisma.follow.delete({ where: { id: existing.id } });
    return NextResponse.json({ following: false });
  }

  await prisma.follow.create({
    data: {
      userId: session.user.id,
      targetType,
      targetId,
      ...relationData,
    },
  });

  // Following a project acts as subscribing to project updates.
  // If the user has no explicit preference yet, default email updates to ON.
  if (targetType === "PROJECT") {
    await prisma.notificationPreference.upsert({
      where: {
        userId_type: {
          userId: session.user.id,
          type: "PROJECT_UPDATES",
        },
      },
      create: {
        userId: session.user.id,
        type: "PROJECT_UPDATES",
        inApp: true,
        email: true,
      },
      // Respect existing user choices (do not override if already configured)
      update: {},
    });
  }

  if (targetType === "USER") {
    const actor = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { username: true },
    });

    await dispatchNotification({
      recipients: [targetId],
      actorId: session.user.id,
      preferenceType: "NEW_FOLLOWERS",
      notificationType: "NEW_FOLLOWER",
      title: "New follower",
      message: `${session.user.name || "Someone"} started following you.`,
      link: actor?.username ? `/users/${actor.username}` : "/profile",
      emailSubject: "You have a new follower on KeyAtlas",
      emailHeading: "You have a new follower",
      emailCtaLabel: "View profile",
    });
  }

  return NextResponse.json({ following: true });
}
