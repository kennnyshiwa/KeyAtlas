import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const mergeSchema = z.object({
  targetId: z.string().min(1, "Target designer is required"),
  sourceIds: z.array(z.string()).min(1, "At least one source designer is required"),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await req.json();
  const result = mergeSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: result.error.issues },
      { status: 400 }
    );
  }

  const { targetId, sourceIds } = result.data;

  // Make sure target isn't in source list
  const filteredSourceIds = sourceIds.filter((id) => id !== targetId);
  if (filteredSourceIds.length === 0) {
    return NextResponse.json(
      { error: "Cannot merge a designer into itself" },
      { status: 400 }
    );
  }

  // Verify target exists
  const target = await prisma.designer.findUnique({ where: { id: targetId } });
  if (!target) {
    return NextResponse.json({ error: "Target designer not found" }, { status: 404 });
  }

  // Verify all sources exist
  const sources = await prisma.designer.findMany({
    where: { id: { in: filteredSourceIds } },
    select: { id: true, name: true },
  });

  if (sources.length !== filteredSourceIds.length) {
    return NextResponse.json({ error: "One or more source designers not found" }, { status: 404 });
  }

  // Reassign all projects from source designers to target
  const updateResult = await prisma.project.updateMany({
    where: { designerId: { in: filteredSourceIds } },
    data: { designerId: targetId },
  });

  // Delete source designers
  await prisma.designer.deleteMany({
    where: { id: { in: filteredSourceIds } },
  });

  return NextResponse.json({
    success: true,
    merged: sources.map((s) => s.name),
    into: target.name,
    projectsMoved: updateResult.count,
  });
}
