import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { projectFormSchema } from "@/lib/validations/project";
import { indexProject, removeProjectFromIndex } from "@/lib/meilisearch";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      images: { orderBy: { order: "asc" } },
      links: true,
      vendor: true,
      creator: { select: { id: true, name: true, image: true } },
    },
  });

  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(project);
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

  // Non-admin users can only edit their own unpublished projects
  if (!isAdmin) {
    const existing = await prisma.project.findUnique({
      where: { id },
      select: { creatorId: true, published: true },
    });
    if (!existing || existing.creatorId !== session.user.id || existing.published) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
  }

  const body = await req.json();
  const result = projectFormSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: result.error.issues },
      { status: 400 }
    );
  }

  const { images, links, projectVendors, ...data } = result.data;

  // Non-admin users cannot publish or feature projects
  if (!isAdmin) {
    data.published = false;
    data.featured = false;
  }

  const slugConflict = await prisma.project.findFirst({
    where: { slug: data.slug, NOT: { id } },
  });
  if (slugConflict) {
    return NextResponse.json(
      { error: "A project with this slug already exists" },
      { status: 409 }
    );
  }

  const project = await prisma.$transaction(async (tx) => {
    await tx.projectImage.deleteMany({ where: { projectId: id } });
    await tx.projectLink.deleteMany({ where: { projectId: id } });
    await tx.projectVendor.deleteMany({ where: { projectId: id } });

    // Auto-set vendorId from first projectVendor for backward compat
    const primaryVendorId = projectVendors.length > 0 ? projectVendors[0].vendorId : null;

    return tx.project.update({
      where: { id },
      data: {
        ...data,
        vendorId: primaryVendorId,
        images: { create: images },
        links: { create: links },
        projectVendors: {
          create: projectVendors.map((pv) => ({
            vendorId: pv.vendorId,
            region: pv.region || null,
            storeLink: pv.storeLink || null,
            endDate: pv.endDate ?? null,
          })),
        },
      },
      include: {
        images: true,
        links: true,
        vendor: { select: { name: true, slug: true } },
        projectVendors: { include: { vendor: { select: { name: true, slug: true } } } },
      },
    });
  });

  if (project.published) {
    await indexProject(project);
  }

  return NextResponse.json(project);
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

  await prisma.project.delete({ where: { id } });
  await removeProjectFromIndex(id);

  return NextResponse.json({ success: true });
}
