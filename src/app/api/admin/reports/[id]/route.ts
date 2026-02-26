import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { removeProjectFromIndex } from "@/lib/meilisearch";
import { z } from "zod";

const resolveSchema = z.object({
  action: z.enum(["non_issue", "resolve_delete"]),
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
    // Delete the reported project and mark report resolved
    await prisma.project.delete({ where: { id: report.projectId } });
    await removeProjectFromIndex(report.projectId);

    const updated = await prisma.projectReport.update({
      where: { id },
      data: {
        status: "RESOLVED",
        resolvedAt: new Date(),
        resolvedById: check.session.user.id,
        resolutionNote: note || "Project removed",
      },
    });
    return NextResponse.json(updated);
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
