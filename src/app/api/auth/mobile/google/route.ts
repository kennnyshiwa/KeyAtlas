import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";

export async function GET(req: NextRequest) {
  const clientId = process.env.AUTH_GOOGLE_ID;
  if (!clientId) {
    return NextResponse.json({ error: "Google OAuth not configured" }, { status: 500 });
  }

  const state = randomBytes(32).toString("hex");
  const baseUrl = process.env.AUTH_URL || process.env.NEXTAUTH_URL || process.env.APP_URL || new URL("/", req.url).origin;
  const redirectUri = `${baseUrl}/api/auth/mobile/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: "openid email profile",
    state: `google:${state}`,
    access_type: "offline",
    prompt: "consent",
  });

  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}
