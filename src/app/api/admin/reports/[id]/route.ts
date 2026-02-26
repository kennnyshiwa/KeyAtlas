import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { removeProjectFromIndex } from "@/lib/meilisearch";
import { z } from "zod";

const resolveSchema = z.object({
  action: z.enum(["non_issue", "resolve_delete", "restore_project"]),
  note: z.string().max(500).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const check = await requireAdminSession();
  if (!check.ok) return NextResponse.json({ error: check.message }, { status: check.status });

  const body = await req.json();
  const result = resolveSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const report = await prisma.projectReport.findUnique({
    where: { id },
    select: { id: true, status: true, projectId: true },
  });
  if (!report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  const { action, note } = result.data;

  if (action === "non_issue") {
    const updated = await prisma.projectReport.update({
      where: { id },
      data: {
        status: "NON_ISSUE",
        resolvedAt: new Date(),
        resolvedById: check.session.user.id,
        resolutionNote: note || "Marked as non-issue",
      },
    });
    return NextResponse.json(updated);
  }

  if (action === "resolve_delete") {
    // Keep report history; remove project from public surfaces by unpublishing it.
    const updated = await prisma.$transaction(async (tx) => {
      await tx.project.update({
        where: { id: report.projectId },
        data: { published: false },
      });

      return tx.projectReport.update({
        where: { id },
        data: {
          status: "RESOLVED",
          resolvedAt: new Date(),
          resolvedById: check.session.user.id,
          resolutionNote: note || "Project unpublished and removed from public view",
        },
      });
    });

    await removeProjectFromIndex(report.projectId);
    return NextResponse.json(updated);
  }

  if (action === "restore_project") {
    const updated = await prisma.$transaction(async (tx) => {
      await tx.project.update({
        where: { id: report.projectId },
        data: { published: true },
      });

      return tx.projectReport.update({
        where: { id },
        data: {
          status: "RESOLVED",
          resolvedAt: new Date(),
          resolvedById: check.session.user.id,
          resolutionNote: note || "Project restored and republished",
        },
      });
    });

    return NextResponse.json(updated);
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
