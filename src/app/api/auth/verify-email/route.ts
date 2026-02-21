import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { getSiteUrl } from "@/lib/site";

function redirectWithStatus(status: "success" | "error", reason?: string) {
  const base = getSiteUrl().replace(/\/$/, "");
  const url = new URL(`/verify-email`, base);
  url.searchParams.set("status", status);
  if (reason) url.searchParams.set("reason", reason);
  return NextResponse.redirect(url.toString(), { status: 302 });
}

export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) {
    return redirectWithStatus("error", "missing_token");
  }

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const record = await prisma.emailVerificationToken.findUnique({
    where: { tokenHash },
  });

  if (!record) {
    return redirectWithStatus("error", "invalid_token");
  }

  if (record.consumedAt) {
    return redirectWithStatus("error", "already_used");
  }

  if (record.expiresAt < new Date()) {
    return redirectWithStatus("error", "expired");
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: record.userId },
      data: { emailVerified: new Date() },
    });

    await tx.emailVerificationToken.update({
      where: { id: record.id },
      data: { consumedAt: new Date() },
    });

    await tx.emailVerificationToken.deleteMany({ where: { userId: record.userId, id: { not: record.id } } });
  });

  return redirectWithStatus("success");
}
