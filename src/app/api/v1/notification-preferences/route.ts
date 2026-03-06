import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateApiKey } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import {
  buildNotificationPreferenceWrite,
  buildNotificationPreferencesView,
} from "@/lib/notifications/preferences";

const preferenceTypeSchema = z.enum([
  "FORUM_REPLIES",
  "FORUM_CATEGORY_THREADS",
  "PROJECT_UPDATES",
  "PROJECT_COMMENTS",
  "PROJECT_STATUS_CHANGES",
  "PROJECT_GB_ENDING_SOON",
  "NEW_FOLLOWERS",
  "WATCHLIST_MATCHES",
]);

const updateSchema = z.object({
  type: preferenceTypeSchema,
  inApp: z.boolean().optional(),
  email: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  const user = await authenticateApiKey(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const stored = await prisma.notificationPreference.findMany({
    where: { userId: user.id },
  });

  const preferences = buildNotificationPreferencesView(stored);

  return NextResponse.json({ data: preferences });
}

export async function PATCH(req: NextRequest) {
  const user = await authenticateApiKey(req);
  if (!user) {
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
        userId: user.id,
        type,
      },
    },
    create: {
      userId: user.id,
      ...write.create,
    },
    update: write.update,
  });

  return NextResponse.json({ data: updated });
}
