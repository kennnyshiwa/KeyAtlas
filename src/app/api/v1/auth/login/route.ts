import { NextRequest, NextResponse } from "next/server";
import { randomBytes, createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { normalizeEmail, verifyPassword } from "@/lib/password";
import { rateLimit, RATE_LIMIT_SIGNUP } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { email, password } = body;
  if (typeof email !== "string" || typeof password !== "string") {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }

  // Rate limit by a hash of the email to prevent brute-force
  const emailHash = createHash("sha256").update(normalizeEmail(email)).digest("hex").slice(0, 16);
  const limited = await rateLimit(emailHash, "v1:auth:login", RATE_LIMIT_SIGNUP);
  if (limited) return limited;

  const normalizedEmail = normalizeEmail(email);
  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

  if (!user || !user.passwordHash) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  if (user.bannedAt) {
    return NextResponse.json({ error: "This account is banned" }, { status: 403 });
  }

  if (user.forcePasswordReset) {
    return NextResponse.json({ error: "Password reset required" }, { status: 403 });
  }

  if (!user.emailVerified) {
    return NextResponse.json({ error: "Email not verified" }, { status: 403 });
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  // Generate API key
  const rawKey = `kv_${randomBytes(32).toString("hex")}`;
  const hashedKey = createHash("sha256").update(rawKey).digest("hex");
  const prefix = rawKey.slice(0, 7);

  await prisma.apiKey.create({
    data: {
      name: "Mobile App",
      key: hashedKey,
      prefix,
      userId: user.id,
    },
  });

  return NextResponse.json({
    data: {
      apiKey: rawKey,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        avatar: user.image,
      },
    },
  });
}
