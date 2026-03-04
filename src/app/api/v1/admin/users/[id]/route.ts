import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { rateLimit, RATE_LIMIT_PROJECT_UPDATE } from "@/lib/rate-limit";

async function requireAdmin(req: NextRequest) {
  const user = await authenticateApiKey(req);
  if (!user) return null;
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { role: true },
  });
  if (dbUser?.role !== "ADMIN") return null;
  return user;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireAdmin(req);
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const limited = await rateLimit(user.id, "v1:admin:users:update", RATE_LIMIT_PROJECT_UPDATE);
  if (limited) return limited;

  const { id } = await params;
  const body = await req.json();

  const data: Record<string, unknown> = {};
  if (typeof body.role === "string" && ["USER", "VENDOR", "MODERATOR", "ADMIN"].includes(body.role)) {
    data.role = body.role;
  }
  if (typeof body.banned === "boolean") {
    data.bannedAt = body.banned ? new Date() : null;
    data.banReason = body.banned ? (body.banReason ?? null) : null;
  }

  const updated = await prisma.user.update({
    where: { id },
    data,
    select: { id: true, username: true, role: true, bannedAt: true },
  });

  return NextResponse.json({ data: updated });
}
