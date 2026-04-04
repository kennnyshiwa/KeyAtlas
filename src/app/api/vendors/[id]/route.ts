import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { vendorFormSchema } from "@/lib/validations/vendor";
import { z } from "zod";
import { indexVendor, removeVendorFromIndex } from "@/lib/meilisearch";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const vendor = await prisma.vendor.findUnique({
    where: { id },
    include: {
      projectVendors: {
        include: {
          project: { select: { id: true, title: true, slug: true, status: true } },
        },
      },
    },
  });

  if (!vendor) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(vendor);
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
  const vendor = await prisma.vendor.findUnique({ where: { id }, select: { ownerId: true } });
  if (!vendor) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const isOwner = vendor.ownerId === session.user.id;
  if (!isAdmin && !isOwner) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await req.json();
  const result = vendorFormSchema.safeParse(body);

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
    description: result.data.description || null,
    storefrontUrl: result.data.storefrontUrl || null,
    verified: result.data.verified,
    regionsServed: result.data.regionsServed,
  };

  if (isAdmin) {
    updateData.slug = result.data.slug;

    // Allow admin to set/clear owner
    if ("ownerId" in body) {
      updateData.ownerId = body.ownerId || null;
    }

    const slugConflict = await prisma.vendor.findFirst({
      where: { slug: result.data.slug, NOT: { id } },
    });
    if (slugConflict) {
      return NextResponse.json(
        { error: "A vendor with this slug already exists" },
        { status: 409 }
      );
    }
  }

  const updated = await prisma.vendor.update({
    where: { id },
    data: updateData,
  });

  await indexVendor(updated);

  return NextResponse.json(updated);
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

  await prisma.vendor.delete({ where: { id } });
  await removeVendorFromIndex(id);
  return NextResponse.json({ success: true });
}
