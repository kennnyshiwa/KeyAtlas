import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isAdmin, requireAdminSession, revokeAllUserSessions } from "@/lib/admin-auth";
import { logAdminAction } from "@/lib/admin-audit";

const bodySchema = z.object({
  banned: z.boolean(),
  reason: z.string().trim().max(500).optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const access = await requireAdminSession();
  if (!access.ok) {
    return NextResponse.json({ error: access.error, message: access.message }, { status: access.status });
  }

  if (!isAdmin(access.session.user.role)) {
    return NextResponse.json({ error: "FORBIDDEN", message: "Admin role required" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", message: "Invalid body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { userId } = await params;
  if (userId === access.session.user.id && parsed.data.banned) {
    return NextResponse.json({ error: "INVALID_ACTION", message: "Cannot ban your own account" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!existing) {
    return NextResponse.json({ error: "NOT_FOUND", message: "User not found" }, { status: 404 });
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      bannedAt: parsed.data.banned ? new Date() : null,
      banReason: parsed.data.banned ? parsed.data.reason || null : null,
    },
    select: { id: true, bannedAt: true, banReason: true },
  });

  if (parsed.data.banned) {
    await revokeAllUserSessions(userId);
  }

  await logAdminAction({
    actorId: access.session.user.id,
    actorRole: access.session.user.role,
    action: parsed.data.banned ? "USER_BANNED" : "USER_UNBANNED",
    resource: "USER",
    resourceId: userId,
    targetId: userId,
    metadata: { reason: parsed.data.reason ?? null },
  });

  return NextResponse.json({ data: updated });
}
