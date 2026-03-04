import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { rateLimit, RATE_LIMIT_KEY_MGMT } from "@/lib/rate-limit";

const bodySchema = z.object({
  token: z.string().min(16),
  platform: z.literal("ios").default("ios"),
  app_bundle_id: z.string().optional(),
  app_version: z.string().optional(),
  device_name: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const user = await authenticateApiKey(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limited = await rateLimit(user.id, "v1:push:register", RATE_LIMIT_KEY_MGMT);
  if (limited) return limited;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 400 });
  }

  const data = parsed.data;

  const device = await prisma.pushDevice.upsert({
    where: { token: data.token },
    create: {
      userId: user.id,
      token: data.token,
      platform: data.platform,
      appBundleId: data.app_bundle_id,
      appVersion: data.app_version,
      deviceName: data.device_name,
      enabled: true,
      lastSeenAt: new Date(),
    },
    update: {
      userId: user.id,
      appBundleId: data.app_bundle_id,
      appVersion: data.app_version,
      deviceName: data.device_name,
      enabled: true,
      lastSeenAt: new Date(),
    },
    select: { id: true, platform: true, enabled: true, lastSeenAt: true },
  });

  return NextResponse.json({ data: device });
}
