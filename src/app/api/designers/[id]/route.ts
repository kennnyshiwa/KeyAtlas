import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { designerFormSchema } from "@/lib/validations/designer";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const designer = await prisma.designer.findUnique({
    where: { id },
    include: {
      projects: {
        select: { id: true, title: true, slug: true, status: true },
      },
    },
  });

  if (!designer) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(designer);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const isAdmin = session.user.role === "ADMIN";
  const existing = await prisma.designer.findUnique({ where: { id }, select: { ownerId: true } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const isOwner = existing.ownerId === session.user.id;
  if (!isAdmin && !isOwner) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await req.json();
  const result = designerFormSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: result.error.issues },
      { status: 400 }
    );
  }

  // Owners can't change slug or owner (admin only)
  const updateData: Record<string, unknown> = {
    name: result.data.name,
    logo: result.data.logo || null,
    banner: result.data.banner || null,
    description: result.data.description || null,
    websiteUrl: result.data.websiteUrl || null,
  };

  if (isAdmin) {
    updateData.slug = result.data.slug;

    // Allow admin to set/clear owner
    if ("ownerId" in body) {
      updateData.ownerId = body.ownerId || null;
    }

    const slugConflict = await prisma.designer.findFirst({
      where: { slug: result.data.slug, NOT: { id } },
    });
    if (slugConflict) {
      return NextResponse.json(
        { error: "A designer with this slug already exists" },
        { status: 409 }
      );
    }
  }

  const designer = await prisma.designer.update({
    where: { id },
    data: updateData,
  });

  return NextResponse.json(designer);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  await prisma.designer.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
