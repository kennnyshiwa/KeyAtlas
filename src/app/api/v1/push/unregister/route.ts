import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { rateLimit, RATE_LIMIT_KEY_MGMT } from "@/lib/rate-limit";

const bodySchema = z.object({
  token: z.string().min(16),
});

export async function POST(req: NextRequest) {
  let user = await authenticateApiKey(req);
  if (!user) {
    const session = await auth();
    if (session?.user?.id) {
      user = await prisma.user.findUnique({ where: { id: session.user.id } });
    }
  }
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limited = await rateLimit(user.id, "v1:push:unregister", RATE_LIMIT_KEY_MGMT);
  if (limited) return limited;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 400 });
  }

  await prisma.pushDevice.updateMany({
    where: { token: parsed.data.token, userId: user.id },
    data: { enabled: false },
  });

  return NextResponse.json({ ok: true });
}
