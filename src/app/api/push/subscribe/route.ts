import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

/**
 * Web-specific push subscription endpoint.
 * Uses session auth (no API key required).
 * The PushSubscription object is stored as JSON string in the `token` field.
 */

const subscribeSchema = z.object({
  subscription: z.object({
    endpoint: z.string().url(),
    keys: z.object({
      p256dh: z.string(),
      auth: z.string(),
    }),
    expirationTime: z.number().nullable().optional(),
  }),
});

const unsubscribeSchema = z.object({
  endpoint: z.string().url(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const body = await req.json().catch(() => null);
  const parsed = subscribeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { subscription } = parsed.data;
  const token = JSON.stringify(subscription);

  const device = await prisma.pushDevice.upsert({
    where: { token },
    create: {
      userId,
      token,
      platform: "web",
      enabled: true,
      lastSeenAt: new Date(),
    },
    update: {
      userId,
      enabled: true,
      lastSeenAt: new Date(),
    },
    select: { id: true, platform: true, enabled: true },
  });

  return NextResponse.json({ data: device });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const body = await req.json().catch(() => null);
  const parsed = unsubscribeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  // Disable all web devices with a token containing this endpoint
  // Since the token is the stringified subscription which includes the endpoint, we search for it
  const devices = await prisma.pushDevice.findMany({
    where: { userId, platform: "web", enabled: true },
    select: { id: true, token: true },
  });

  const toDisable = devices.filter((d) => {
    try {
      const sub = JSON.parse(d.token) as { endpoint?: string };
      return sub.endpoint === parsed.data.endpoint;
    } catch {
      return false;
    }
  });

  if (toDisable.length > 0) {
    await prisma.pushDevice.updateMany({
      where: { id: { in: toDisable.map((d) => d.id) } },
      data: { enabled: false },
    });
  }

  return NextResponse.json({ ok: true });
}
