import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;

  const project = await prisma.project.findUnique({
    where: { slug },
    select: { id: true, creatorId: true },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const userRole = session.user.role as string | undefined;
  const isCreator = session.user.id === project.creatorId;
  const isAdmin = userRole === "ADMIN" || userRole === "MODERATOR";

  if (!isCreator && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [total, bySource, byDay] = await Promise.all([
    prisma.referralClick.count({ where: { projectId: project.id } }),

    prisma.referralClick.groupBy({
      by: ["ref"],
      where: { projectId: project.id },
      _count: { ref: true },
      orderBy: { _count: { ref: "desc" } },
    }),

    prisma.$queryRaw<{ date: string; count: bigint }[]>`
      SELECT DATE("createdAt") as date, COUNT(*)::bigint as count
      FROM "referral_clicks"
      WHERE "projectId" = ${project.id}
        AND "createdAt" >= NOW() - INTERVAL '30 days'
      GROUP BY DATE("createdAt")
      ORDER BY date ASC
    `,
  ]);

  return NextResponse.json({
    total,
    bySource: bySource.map((row) => ({
      ref: row.ref,
      count: row._count.ref,
    })),
    byDay: byDay.map((row) => ({
      date: String(row.date),
      count: Number(row.count),
    })),
  });
}
