import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { projectUpdateFormSchema } from "@/lib/validations/project-update";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id } = await params;

  const update = await prisma.projectUpdate.findUnique({
    where: { id },
    include: { project: { select: { creatorId: true } } },
  });

  if (!update) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (
    update.project.creatorId !== session.user.id &&
    session.user.role !== "ADMIN"
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await req.json();
  const result = projectUpdateFormSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: result.error.issues },
      { status: 400 }
    );
  }

  const updated = await prisma.projectUpdate.update({
    where: { id },
    data: result.data,
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id } = await params;

  const update = await prisma.projectUpdate.findUnique({
    where: { id },
    include: { project: { select: { creatorId: true } } },
  });

  if (!update) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (
    update.project.creatorId !== session.user.id &&
    session.user.role !== "ADMIN"
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  await prisma.projectUpdate.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
