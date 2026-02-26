import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const check = await requireAdminSession({ allowModeratorReadOnly: true });
  if (!check.ok) return NextResponse.json({ error: check.message }, { status: check.status });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || undefined;

  const reports = await prisma.projectReport.findMany({
    where: status ? { status: status as "OPEN" | "NON_ISSUE" | "RESOLVED" } : undefined,
    include: {
      project: { select: { id: true, title: true, slug: true } },
      reporter: { select: { id: true, name: true, username: true } },
      resolvedBy: { select: { id: true, name: true, username: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json({ reports });
}
