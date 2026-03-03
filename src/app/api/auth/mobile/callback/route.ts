import { NextRequest, NextResponse } from "next/server";
import { randomBytes, createHash } from "crypto";
import { prisma } from "@/lib/prisma";

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

function errorRedirect(message: string) {
  return NextResponse.redirect(`keyatlas://auth/callback?error=${encodeURIComponent(message)}`);
}

// ─── Discord helpers ───────────────────────────────────────────

async function exchangeDiscordCode(code: string, redirectUri: string) {
  const res = await fetch("https://discord.com/api/v10/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.AUTH_DISCORD_ID!,
      client_secret: process.env.AUTH_DISCORD_SECRET!,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });
  if (!res.ok) return null;
  return res.json() as Promise<{ access_token: string; token_type: string }>;
}

async function getDiscordUser(accessToken: string) {
  const res = await fetch("https://discord.com/api/v10/users/@me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  return res.json() as Promise<{
    id: string;
    username: string;
    global_name?: string;
    email?: string;
    avatar?: string;
  }>;
}

// ─── Google helpers ────────────────────────────────────────────

async function exchangeGoogleCode(code: string, redirectUri: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.AUTH_GOOGLE_ID!,
      client_secret: process.env.AUTH_GOOGLE_SECRET!,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });
  if (!res.ok) return null;
  return res.json() as Promise<{ access_token: string; id_token: string }>;
}

async function getGoogleUser(accessToken: string) {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  return res.json() as Promise<{
    id: string;
    name?: string;
    email?: string;
    picture?: string;
  }>;
}

// ─── Main callback handler ────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) return errorRedirect(error);
  if (!code || !state) return errorRedirect("Missing code or state");

  const [provider] = state.split(":");
  const baseUrl = process.env.NEXTAUTH_URL || new URL("/", req.url).origin;
  const redirectUri = `${baseUrl}/api/auth/mobile/callback`;

  let email: string | null = null;
  let name: string | null = null;
  let image: string | null = null;
  let providerAccountId: string | null = null;

  try {
    if (provider === "discord") {
      const tokenData = await exchangeDiscordCode(code, redirectUri);
      if (!tokenData) return errorRedirect("Discord token exchange failed");

      const discordUser = await getDiscordUser(tokenData.access_token);
      if (!discordUser?.email) return errorRedirect("Could not get Discord email");

      email = discordUser.email;
      name = discordUser.global_name || discordUser.username;
      providerAccountId = discordUser.id;
      if (discordUser.avatar) {
        image = `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`;
      }
    } else if (provider === "google") {
      const tokenData = await exchangeGoogleCode(code, redirectUri);
      if (!tokenData) return errorRedirect("Google token exchange failed");

      const googleUser = await getGoogleUser(tokenData.access_token);
      if (!googleUser?.email) return errorRedirect("Could not get Google email");

      email = googleUser.email;
      name = googleUser.name ?? null;
      providerAccountId = googleUser.id;
      image = googleUser.picture ?? null;
    } else {
      return errorRedirect("Unknown provider");
    }

    if (!email) return errorRedirect("No email from provider");

    // Find or create user
    let user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true, username: true, role: true, image: true, bannedAt: true },
    });

    if (user?.bannedAt) return errorRedirect("This account is banned");

    if (!user) {
      const username = await uniqueUsername(name || email.split("@")[0]);
      user = await prisma.user.create({
        data: {
          email: email.toLowerCase(),
          emailVerified: new Date(),
          name,
          displayName: name,
          username,
          image,
        },
        select: { id: true, username: true, role: true, image: true, bannedAt: true },
      });
    } else {
      // Update avatar if missing
      if (!user.image && image) {
        await prisma.user.update({
          where: { id: user.id },
          data: { image },
        });
      }
    }

    // Link OAuth account if not already linked
    const existingAccount = await prisma.account.findFirst({
      where: { userId: user.id, provider },
    });
    if (!existingAccount && providerAccountId) {
      await prisma.account.create({
        data: {
          userId: user.id,
          type: "oauth",
          provider,
          providerAccountId,
        },
      });
    }

    // Ensure email is verified for OAuth users
    await prisma.user.updateMany({
      where: { id: user.id, emailVerified: null },
      data: { emailVerified: new Date() },
    });

    // Generate API key
    const { rawKey, hashedKey, prefix } = generateApiKey();
    await prisma.apiKey.create({
      data: {
        name: `Mobile App (${provider})`,
        key: hashedKey,
        prefix,
        userId: user.id,
      },
    });

    // Redirect back to app with token
    const params = new URLSearchParams({
      token: rawKey,
      user_id: user.id,
      username: user.username || "",
      role: user.role,
      avatar: user.image || "",
    });

    return NextResponse.redirect(`keyatlas://auth/callback?${params}`);
  } catch (err) {
    console.error("[mobile-oauth] callback error:", err);
    return errorRedirect("Authentication failed");
  }
}
