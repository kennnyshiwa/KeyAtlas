import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/admin-auth";
import { createKeycapProfile, listKeycapProfiles } from "@/lib/keycap-profiles";

const schema = z.object({
  name: z.string().min(1).max(50),
});

export async function GET() {
  const access = await requireAdminSession({ allowModeratorReadOnly: true });
  if (!access.ok) {
    return NextResponse.json({ error: access.error, message: access.message }, { status: access.status });
  }

  const profiles = await listKeycapProfiles();
  return NextResponse.json({ profiles });
}

export async function POST(request: Request) {
  try {
    const access = await requireAdminSession();
    if (!access.ok) {
      return NextResponse.json({ error: access.error, message: access.message }, { status: access.status });
    }

    const body = await request.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "INVALID_INPUT", details: parsed.error.flatten() }, { status: 400 });
    }

    const created = await createKeycapProfile(parsed.data.name);
    return NextResponse.json({ profile: created });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: "INTERNAL_ERROR", message }, { status: 500 });
  }
}
