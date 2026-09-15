import { NextRequest, NextResponse } from "next/server";
import { requestIdentity } from "@/lib/users/request-identity";
import { prisma } from "@/lib/prisma";
import { rateLimit, RATE_LIMIT_FOLLOW } from "@/lib/rate-limit";
import { dispatchNotification } from "@/lib/notifications/service";

type Context = { params: Promise<{ username: string }> };

async function changeFollow(req: NextRequest, context: Context, add: boolean) {
  const user = await requestIdentity(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Share the browser follow budget rather than granting a second mutation budget.
  const limited = await rateLimit(user.id, "follow", RATE_LIMIT_FOLLOW);
  if (limited) return limited;
  const { username } = await context.params;
  const target = await prisma.user.findUnique({ where: { username }, select: { id: true } });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (target.id === user.id) {
    return NextResponse.json({ error: "Cannot follow yourself" }, { status: 400 });
  }
  const identity = { userId: user.id, targetType: "USER" as const, targetId: target.id };
  if (!add) {
    await prisma.follow.deleteMany({ where: identity });
    return NextResponse.json({ data: { following: false } });
  }
  // ON CONFLICT DO NOTHING uses the existing unique constraint. Only the winning
  // insert dispatches a notification, including simultaneous duplicate requests.
  const inserted = await prisma.follow.createMany({
    data: [{ ...identity, targetUserId: target.id }], skipDuplicates: true,
  });
  if (inserted.count) {
    const actor = await prisma.user.findUnique({
      where: { id: user.id }, select: { username: true },
    });
    await dispatchNotification({
      recipients: [target.id], actorId: user.id,
      preferenceType: "NEW_FOLLOWERS", notificationType: "NEW_FOLLOWER",
      title: "New follower", message: `${user.name || "Someone"} started following you.`,
      link: actor?.username ? `/users/${actor.username}` : "/profile",
      emailSubject: "You have a new follower on KeyAtlas",
      emailHeading: "You have a new follower", emailCtaLabel: "View profile",
    });
  }
  return NextResponse.json({ data: { following: true } }, { status: inserted.count ? 201 : 200 });
}

export async function POST(req: NextRequest, context: Context) {
  return changeFollow(req, context, true);
}
export async function DELETE(req: NextRequest, context: Context) {
  return changeFollow(req, context, false);
}
