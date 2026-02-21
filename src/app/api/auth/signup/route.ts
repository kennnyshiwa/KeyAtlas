import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashPassword, normalizeEmail, validatePasswordStrength } from "@/lib/password";
import { sendVerificationEmail } from "@/lib/mail";

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().max(50).optional().nullable(),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid data", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { email, password, displayName } = parsed.data;
  const normalizedEmail = normalizeEmail(email);

  const passwordError = validatePasswordStrength(password);
  if (passwordError) {
    return NextResponse.json({ error: passwordError }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    return NextResponse.json(
      { error: "An account with this email already exists. Please sign in instead." },
      { status: 409 }
    );
  }

  const passwordHash = await hashPassword(password.trim());
  const token = `${crypto.randomUUID()}${crypto.randomBytes(24).toString("hex")}`;
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24); // 24 hours

  await prisma.$transaction(async (tx) => {
    const userCount = await tx.user.count();
    const isFirstUser = userCount === 0;

    const user = await tx.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        displayName: displayName?.trim() || null,
        name: displayName?.trim() || null,
        emailVerified: null,
        role: isFirstUser ? "ADMIN" : "USER",
      },
    });

    await tx.emailVerificationToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });
  });

  await sendVerificationEmail({
    email: normalizedEmail,
    token,
    displayName: displayName?.trim() || null,
  });

  return NextResponse.json({
    success: true,
    message: "Account created. Check your email for a verification link.",
  });
}
