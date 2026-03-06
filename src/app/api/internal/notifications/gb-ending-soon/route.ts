import { NextRequest, NextResponse } from "next/server";
import { runGbEndingSoonNotifications } from "@/lib/notifications/gb-ending-soon";

function isAuthorized(req: NextRequest) {
  const secret = process.env.NOTIFICATION_JOB_SECRET;
  if (!secret) return false;

  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;

  return authHeader.slice(7) === secret;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runGbEndingSoonNotifications();
  return NextResponse.json({ ok: true, ...result });
}
