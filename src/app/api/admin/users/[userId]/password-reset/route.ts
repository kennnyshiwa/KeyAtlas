import crypto from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdmin, requireAdminSession, revokeAllUserSessions } from "@/lib/admin-auth";
import { getSiteUrl } from "@/lib/site";

export async function POST(
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
  const existing = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!existing) {
    return NextResponse.json({ error: "NOT_FOUND", message: "User not found" }, { status: 404 });
  }

  const rawToken = `${crypto.randomUUID()}${crypto.randomBytes(16).toString("hex")}`;
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 30);

  await prisma.$transaction(async (tx) => {
    await tx.passwordResetToken.updateMany({
      where: { userId, consumedAt: null, expiresAt: { gt: new Date() } },
      data: { consumedAt: new Date() },
    });

    await tx.passwordResetToken.create({
      data: { userId, tokenHash, expiresAt },
    });

    await tx.user.update({
      where: { id: userId },
      data: { forcePasswordReset: true },
    });
  });

  await revokeAllUserSessions(userId);

  const baseUrl = getSiteUrl().replace(/\/$/, "");
  const resetLink = `${baseUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;

  return NextResponse.json({
    data: {
      resetLink,
      expiresAt,
      note: "Store this link securely and share with the user through a trusted channel.",
    },
  });
}
