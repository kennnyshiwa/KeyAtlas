import { NextResponse } from "next/server";

export async function GET() {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";
  return NextResponse.json({ siteKey });
}
