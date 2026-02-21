import { randomBytes, createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createApiKeySchema } from "@/lib/validations/api-key";
import { rateLimit, RATE_LIMIT_KEY_MGMT } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = rateLimit(session.user.id, "api-keys:create", RATE_LIMIT_KEY_MGMT);
  if (limited) return limited;

  const body = await req.json();
  const result = createApiKeySchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: result.error.issues },
      { status: 400 }
    );
  }

  const rawKey = "kv_" + randomBytes(20).toString("hex");
  const hashed = createHash("sha256").update(rawKey).digest("hex");
  const prefix = rawKey.slice(0, 11) + "...";

  const apiKey = await prisma.apiKey.create({
    data: {
      name: result.data.name,
      key: hashed,
      prefix,
      userId: session.user.id,
    },
  });

  return NextResponse.json(
    {
      id: apiKey.id,
      name: apiKey.name,
      key: rawKey,
      prefix: apiKey.prefix,
      createdAt: apiKey.createdAt,
    },
    { status: 201 }
  );
}

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = rateLimit(session.user.id, "api-keys:list", RATE_LIMIT_KEY_MGMT);
  if (limited) return limited;

  const keys = await prisma.apiKey.findMany({
    where: { userId: session.user.id, revoked: false },
    select: {
      id: true,
      name: true,
      prefix: true,
      createdAt: true,
      lastUsedAt: true,
      expiresAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(keys);
}
