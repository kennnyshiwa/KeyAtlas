import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";

export async function GET(req: NextRequest) {
  const clientId = process.env.AUTH_DISCORD_ID;
  if (!clientId) {
    return NextResponse.json({ error: "Discord OAuth not configured" }, { status: 500 });
  }

  const state = randomBytes(32).toString("hex");
  const baseUrl = process.env.NEXTAUTH_URL || new URL("/", req.url).origin;
  const redirectUri = `${baseUrl}/api/auth/mobile/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: "identify email",
    state: `discord:${state}`,
    prompt: "consent",
  });

  return NextResponse.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
}
