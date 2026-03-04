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

  const limited = await rateLimit(user.id, "v1:admin:reports:update", RATE_LIMIT_PROJECT_UPDATE);
  if (limited) return limited;

  const { id } = await params;
  const body = await req.json();

  const data: Record<string, unknown> = {};
  if (typeof body.status === "string" && ["RESOLVED", "NON_ISSUE"].includes(body.status)) {
    data.status = body.status;
    data.resolvedAt = new Date();
    data.resolvedById = user.id;
  }
  if (typeof body.resolutionNote === "string") {
    data.resolutionNote = body.resolutionNote;
  }

  const report = await prisma.projectReport.update({
    where: { id },
    data,
    select: { id: true, status: true, resolvedAt: true, resolutionNote: true },
  });

  return NextResponse.json({ data: report });
}
