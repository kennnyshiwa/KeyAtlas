import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import {
  buildNotificationPreferenceWrite,
  buildNotificationPreferencesView,
} from "@/lib/notifications/preferences";

const preferenceTypeSchema = z.enum([
  "FORUM_REPLIES",
  "FORUM_CATEGORY_THREADS",
  "PROJECT_UPDATES",
  "PROJECT_COMMENTS",
  "NEW_FOLLOWERS",
]);

const updateSchema = z.object({
  type: preferenceTypeSchema,
  inApp: z.boolean().optional(),
  email: z.boolean().optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const stored = await prisma.notificationPreference.findMany({
    where: { userId: session.user.id },
  });

  const preferences = buildNotificationPreferencesView(stored);

  return NextResponse.json({ preferences });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body", code: "INVALID_JSON" }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid data", details: parsed.error.flatten() }, { status: 400 });
  }

  const { type, inApp, email } = parsed.data;
  const write = buildNotificationPreferenceWrite(type, inApp, email);

  const updated = await prisma.notificationPreference.upsert({
    where: {
      userId_type: {
        userId: session.user.id,
        type,
      },
    },
    create: {
      userId: session.user.id,
      ...write.create,
    },
    update: write.update,
  });

  return NextResponse.json({ preference: updated });
}
