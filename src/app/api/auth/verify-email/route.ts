import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { getSiteUrl } from "@/lib/site";

function redirectWithStatus(status: "success" | "error" | "confirm", reason?: string, token?: string) {
  const base = getSiteUrl().replace(/\/$/, "");
  const url = new URL(`/verify-email`, base);
  url.searchParams.set("status", status);
  if (reason) url.searchParams.set("reason", reason);
  if (token) url.searchParams.set("token", token);
  return NextResponse.redirect(url.toString(), { status: 302 });
}

async function consumeVerificationToken(token: string) {
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const record = await prisma.emailVerificationToken.findUnique({ where: { tokenHash } });

  if (!record) return { ok: false as const, reason: "invalid_token" };

  const user = await prisma.user.findUnique({
    where: { id: record.userId },
    select: { emailVerified: true },
  });

  if (record.consumedAt || record.expiresAt < new Date()) {
    if (user?.emailVerified) return { ok: true as const };
    return { ok: false as const, reason: record.consumedAt ? "already_used" : "expired" };
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: record.userId }, data: { emailVerified: new Date() } });
    await tx.emailVerificationToken.update({ where: { id: record.id }, data: { consumedAt: new Date() } });
    await tx.emailVerificationToken.deleteMany({ where: { userId: record.userId, id: { not: record.id } } });
  });

  return { ok: true as const };
}

export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) {
    return redirectWithStatus("error", "missing_token");
  }

  // Do not consume token on GET to avoid automatic verification by link scanners.
  return redirectWithStatus("confirm", undefined, token);
}

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const token = (form?.get("token") || "").toString();

  if (!token) {
    return redirectWithStatus("error", "missing_token");
  }

  const result = await consumeVerificationToken(token);
  if (!result.ok) {
    return redirectWithStatus("error", result.reason);
  }

  return redirectWithStatus("success");
}
