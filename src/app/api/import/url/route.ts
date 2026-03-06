import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { importUrlPrefill } from "@/lib/import/url-prefill";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const url = typeof body?.url === "string" ? body.url.trim() : "";

  if (!url) {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }

  try {
    const prefill = await importUrlPrefill(url);
    return NextResponse.json({ prefill });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to import URL";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
