import { NextResponse } from "next/server";
import { listKeycapProfiles } from "@/lib/keycap-profiles";

export async function GET() {
  const profiles = await listKeycapProfiles();
  return NextResponse.json({ profiles });
}
