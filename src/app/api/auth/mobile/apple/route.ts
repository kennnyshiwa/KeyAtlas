/**
 * POST /api/auth/mobile/apple
 *
 * Receives an Apple identity token from the native iOS app, verifies it against
 * Apple's public keys, then creates or links the user account and returns an API key.
 *
 * Body: { identityToken: string, fullName?: { givenName?: string, familyName?: string } }
 */

import { NextRequest, NextResponse } from "next/server";
import { randomBytes, createHash } from "crypto";
import { jwtVerify, createRemoteJWKSet } from "jose";
import { prisma } from "@/lib/prisma";

// Apple's public key endpoint
const APPLE_JWKS_URI = new URL("https://appleid.apple.com/auth/keys");
const appleJWKS = createRemoteJWKSet(APPLE_JWKS_URI);

// The iOS native flow uses the Bundle ID as the audience
const APPLE_BUNDLE_ID = "com.kennnyshiwa.KeyAtlas";

interface AppleTokenPayload {
  iss: string;
  aud: string | string[];
  sub: string; // Apple user ID
  email?: string;
  email_verified?: boolean | string;
  is_private_email?: boolean | string;
  real_user_status?: number;
}

function slugifyUsername(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30);
}

async function uniqueUsername(seed: string): Promise<string> {
  const base = slugifyUsername(seed || "user");
  let candidate = base.length >= 3 ? base : "user";
  let i = 1;
  while (
    await prisma.user.findUnique({
      where: { username: candidate },
      select: { id: true },
    })
  ) {
    const suffix = `-${i++}`;
    candidate = `${base.slice(0, Math.max(3, 30 - suffix.length))}${suffix}`;
  }
  return candidate;
}

function generateApiKey() {
  const rawKey = `kv_${randomBytes(32).toString("hex")}`;
  const hashedKey = createHash("sha256").update(rawKey).digest("hex");
  const prefix = rawKey.slice(0, 7);
  return { rawKey, hashedKey, prefix };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { identityToken, fullName } = body as {
      identityToken?: string;
      fullName?: { givenName?: string; familyName?: string };
    };

    if (!identityToken) {
      return NextResponse.json({ error: "Missing identityToken" }, { status: 400 });
    }

    // Verify the Apple identity token
    let payload: AppleTokenPayload;
    try {
      const { payload: verified } = await jwtVerify(identityToken, appleJWKS, {
        issuer: "https://appleid.apple.com",
        audience: APPLE_BUNDLE_ID,
      });
      payload = verified as unknown as AppleTokenPayload;
    } catch (err) {
      console.error("[mobile-apple] Token verification failed:", err);
      return NextResponse.json({ error: "Invalid identity token" }, { status: 401 });
    }

    const appleUserId = payload.sub;
    const email = payload.email ?? null;

    if (!appleUserId) {
      return NextResponse.json({ error: "Invalid token: no subject" }, { status: 401 });
    }

    // Build a display name from fullName if provided (only sent on first sign-in by Apple)
    const nameParts = [fullName?.givenName, fullName?.familyName].filter(Boolean);
    const name = nameParts.length > 0 ? nameParts.join(" ") : null;

    // Check if we already have an account linked to this Apple user ID
    const existingAccount = await prisma.account.findUnique({
      where: {
        provider_providerAccountId: {
          provider: "apple",
          providerAccountId: appleUserId,
        },
      },
      include: { user: { select: { id: true, username: true, role: true, image: true, bannedAt: true } } },
    });

    let user: { id: string; username: string | null; role: string; image: string | null; bannedAt: Date | null } | null =
      existingAccount?.user ?? null;

    if (user?.bannedAt) {
      return NextResponse.json({ error: "This account is banned" }, { status: 403 });
    }

    if (!user) {
      // Try to find an existing user by email (if Apple provided one)
      if (email) {
        const byEmail = await prisma.user.findUnique({
          where: { email: email.toLowerCase() },
          select: { id: true, username: true, role: true, image: true, bannedAt: true },
        });
        if (byEmail?.bannedAt) {
          return NextResponse.json({ error: "This account is banned" }, { status: 403 });
        }
        user = byEmail ?? null;
      }

      if (!user) {
        // Create a new user
        const seedName = name || (email ? email.split("@")[0] : "apple-user");
        const username = await uniqueUsername(seedName);
        user = await prisma.user.create({
          data: {
            email: email ? email.toLowerCase() : null,
            emailVerified: email ? new Date() : null,
            name,
            displayName: name,
            username,
          },
          select: { id: true, username: true, role: true, image: true, bannedAt: true },
        });
      }

      // Link the Apple account
      await prisma.account.create({
        data: {
          userId: user.id,
          type: "oauth",
          provider: "apple",
          providerAccountId: appleUserId,
        },
      });
    }

    // Ensure email is marked verified
    if (email) {
      await prisma.user.updateMany({
        where: { id: user.id, emailVerified: null },
        data: { emailVerified: new Date() },
      });
    }

    // Ensure first user becomes admin
    const adminCount = await prisma.user.count({ where: { role: "ADMIN", bannedAt: null } });
    if (adminCount === 0) {
      await prisma.user.update({ where: { id: user.id }, data: { role: "ADMIN" } });
    }

    // Generate API key
    const { rawKey, hashedKey, prefix } = generateApiKey();
    await prisma.apiKey.create({
      data: {
        name: "Mobile App (apple)",
        key: hashedKey,
        prefix,
        userId: user.id,
      },
    });

    return NextResponse.json({
      token: rawKey,
      user_id: user.id,
      username: user.username ?? "",
      role: user.role,
      avatar: user.image ?? "",
    });
  } catch (err) {
    console.error("[mobile-apple] Unexpected error:", err);
    return NextResponse.json({ error: "Authentication failed" }, { status: 500 });
  }
}
