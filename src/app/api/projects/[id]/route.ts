import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { projectFormSchema } from "@/lib/validations/project";
import { indexProject, removeProjectFromIndex } from "@/lib/meilisearch";
import { slugify } from "@/lib/slug";

async function findOrCreateVendorByEntry(entry: {
  vendorId: string;
  customVendorName?: string | null;
  customVendorWebsite?: string | null;
}) {
  if (entry.vendorId && entry.vendorId !== "__new__") return entry.vendorId;

  const rawName = entry.customVendorName?.trim();
  if (!rawName) return null;

  const existing = await prisma.vendor.findFirst({
    where: { name: { equals: rawName, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) return existing.id;

  const baseSlug = slugify(rawName) || "vendor";
  let slug = baseSlug;
  let i = 1;
  while (await prisma.vendor.findUnique({ where: { slug }, select: { id: true } })) {
    slug = `${baseSlug}-${i++}`;
  }

  const created = await prisma.vendor.create({
    data: {
      name: rawName,
      slug,
      storefrontUrl: entry.customVendorWebsite || null,
      verified: false,
      regionsServed: [],
    },
    select: { id: true },
  });

  return created.id;
}


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
  const { searchParams } = new URL(req.url);
  const intent = searchParams.get("intent");
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

  // Optional explicit intent for draft/review/publish/preview while keeping legacy payload compatibility
  if (intent === "draft" || intent === "review") {
    data.published = false;
  }
  if (intent === "publish" && isAdmin) {
    data.published = true;
  }
  // intent=preview preserves payload published state (admins) while still saving latest edits.

  const slugConflict = await prisma.project.findFirst({
    where: { slug: data.slug, NOT: { id } },
  });
  if (slugConflict) {
    return NextResponse.json(
      { error: "A project with this slug already exists" },
      { status: 409 }
    );
  }

  const resolvedVendors = (
    await Promise.all(
      projectVendors.map(async (pv) => ({
        ...pv,
        vendorId: await findOrCreateVendorByEntry({
          vendorId: pv.vendorId,
          customVendorName: pv.customVendorName,
          customVendorWebsite: pv.customVendorWebsite,
        }),
      }))
    )
  ).filter((pv) => !!pv.vendorId) as Array<{
    vendorId: string;
    region?: string;
    storeLink?: string;
    endDate?: Date | null;
  }>;

  const project = await prisma.$transaction(async (tx) => {
    await tx.projectImage.deleteMany({ where: { projectId: id } });
    await tx.projectLink.deleteMany({ where: { projectId: id } });
    await tx.projectVendor.deleteMany({ where: { projectId: id } });

    // Auto-set vendorId from first projectVendor for backward compat
    const primaryVendorId = resolvedVendors.length > 0 ? resolvedVendors[0].vendorId : null;

    return tx.project.update({
      where: { id },
      data: {
        ...data,
        vendorId: primaryVendorId,
        images: { create: images },
        links: { create: links },
        projectVendors: {
          create: resolvedVendors.map((pv) => ({
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
