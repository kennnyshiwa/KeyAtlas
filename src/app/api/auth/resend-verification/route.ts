import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { normalizeEmail } from "@/lib/password";
import { sendVerificationEmail } from "@/lib/mail";
import { rateLimit } from "@/lib/rate-limit";

const resendSchema = z.object({
  email: z.string().email(),
});

const RESEND_RATE_LIMIT = { limit: 3, window: 900 }; // 3 requests per 15 minutes

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = resendSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  const normalizedEmail = normalizeEmail(parsed.data.email);
  const rateLimited = rateLimit(normalizedEmail, "resend-verification", RESEND_RATE_LIMIT);
  if (rateLimited) return rateLimited;

  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

  if (!user || !user.passwordHash) {
    // Avoid user enumeration; respond success.
    return NextResponse.json({ success: true });
  }

  if (user.emailVerified) {
    return NextResponse.json({
      success: true,
      message: "Email is already verified. You can sign in.",
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

  await sendVerificationEmail({ email: normalizedEmail, token, displayName: user.displayName ?? user.name ?? null });

  return NextResponse.json({ success: true });
}
