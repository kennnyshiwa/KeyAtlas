import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashPassword, normalizeEmail, validatePasswordStrength } from "@/lib/password";
import { sendVerificationEmail } from "@/lib/mail";
import { rateLimit, RATE_LIMIT_SIGNUP } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/security/turnstile";

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().max(50).optional().nullable(),
  turnstileToken: z.string().optional().nullable(),
});

// Generic success message used for both new and existing accounts
// to prevent account enumeration.
const SUCCESS_MSG = "If this email is not already registered, you will receive a verification link shortly.";

export async function POST(req: NextRequest) {
  // IP-based rate limiting
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  const rateLimited = await rateLimit(ip, "auth:signup", RATE_LIMIT_SIGNUP);
  if (rateLimited) return rateLimited;

  const body = await req.json().catch(() => null);
  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid data", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { email, password, displayName, turnstileToken } = parsed.data;

  // Turnstile verification
  const turnstileResult = await verifyTurnstile(turnstileToken, ip);
  if (!turnstileResult.success) {
    return NextResponse.json(
      { error: turnstileResult.error || "Verification failed" },
      { status: 400 }
    );
  }

  const normalizedEmail = normalizeEmail(email);

  const passwordError = validatePasswordStrength(password);
  if (passwordError) {
    return NextResponse.json({ error: passwordError }, { status: 400 });
  }

  // Check for existing account — return same generic response to prevent enumeration
  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    return NextResponse.json({
      success: true,
      message: SUCCESS_MSG,
    });
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
    message: SUCCESS_MSG,
  });
}
