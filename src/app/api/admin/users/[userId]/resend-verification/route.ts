import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { isAdmin, requireAdminSession } from "@/lib/admin-auth";
import { sendVerificationEmail } from "@/lib/mail";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const access = await requireAdminSession({ allowModeratorReadOnly: true });
  if (!access.ok) {
    return NextResponse.json({ error: access.error, message: access.message }, { status: access.status });
  }

  if (!isAdmin(access.session.user.role)) {
    return NextResponse.json({ error: "FORBIDDEN", message: "Admin role required" }, { status: 403 });
  }

  const { userId } = await params;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, displayName: true, name: true, emailVerified: true, passwordHash: true },
  });

  if (!user || !user.email || !user.passwordHash) {
    return NextResponse.json({ error: "NOT_FOUND", message: "Eligible user not found" }, { status: 404 });
  }

  if (user.emailVerified) {
    return NextResponse.json({
      data: { sent: false, alreadyVerified: true },
      message: "User email is already verified",
    });
  }

  const token = `${crypto.randomUUID()}${crypto.randomBytes(24).toString("hex")}`;
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24);

  await prisma.$transaction(async (tx) => {
    await tx.emailVerificationToken.deleteMany({ where: { userId: user.id } });
    await tx.emailVerificationToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });
  });

  await sendVerificationEmail({
    email: user.email,
    token,
    displayName: user.displayName ?? user.name ?? null,
  });

  return NextResponse.json({ data: { sent: true } });
}
