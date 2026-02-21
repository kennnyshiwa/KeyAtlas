import { createHash } from "crypto";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export async function authenticateApiKey(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const rawKey = authHeader.slice(7);
  if (!rawKey.startsWith("kv_")) {
    return null;
  }

  const hashed = hashKey(rawKey);

  const apiKey = await prisma.apiKey.findUnique({
    where: { key: hashed },
    include: { user: true },
  });

  if (!apiKey) return null;
  if (apiKey.revoked) return null;
  if (apiKey.expiresAt && apiKey.expiresAt < new Date()) return null;

  // Update lastUsedAt without blocking the response
  prisma.apiKey.update({
    where: { id: apiKey.id },
    data: { lastUsedAt: new Date() },
  }).catch(() => {});

  return apiKey.user;
}

export { hashKey };
