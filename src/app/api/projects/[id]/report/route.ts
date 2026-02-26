import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit, RATE_LIMIT_PROJECT_REPORT } from "@/lib/rate-limit";
import { z } from "zod";

const reportSchema = z.object({
  reason: z.string().min(10, "Please provide at least 10 characters explaining the issue.").max(2000),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const rateLimited = rateLimit(session.user.id, "project:report", RATE_LIMIT_PROJECT_REPORT);
  if (rateLimited) return rateLimited;

  const body = await req.json();
  const result = reportSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { error: result.error.issues[0]?.message ?? "Validation failed" },
      { status: 400 }
    );
  }

  // Check project exists
  const project = await prisma.project.findUnique({ where: { id }, select: { id: true, title: true, slug: true } });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Prevent duplicate open reports from same user on same project
  const existing = await prisma.projectReport.findFirst({
    where: { projectId: id, reporterId: session.user.id, status: "OPEN" },
  });
  if (existing) {
    return NextResponse.json({ error: "You already have an open report for this project." }, { status: 409 });
  }

  const report = await prisma.projectReport.create({
    data: {
      projectId: id,
      reporterId: session.user.id,
      reason: result.data.reason,
    },
  });

  // Notify admins/moderators
  const admins = await prisma.user.findMany({
    where: { role: { in: ["ADMIN", "MODERATOR"] } },
    select: { id: true },
  });

  if (admins.length > 0) {
    await prisma.notification.createMany({
      data: admins.map((a) => ({
        userId: a.id,
        type: "PROJECT_UPDATE" as const,
        title: "New project report",
        message: `"${project.title}" was reported: ${result.data.reason.slice(0, 100)}`,
        link: `/admin/reports`,
      })),
    });
  }

  return NextResponse.json({ id: report.id }, { status: 201 });
}
