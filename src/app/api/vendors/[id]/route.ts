import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { vendorFormSchema } from "@/lib/validations/vendor";

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
  if (!session?.user || session.user.role !== "ADMIN") {
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

  const slugConflict = await prisma.vendor.findFirst({
    where: { slug: result.data.slug, NOT: { id } },
  });
  if (slugConflict) {
    return NextResponse.json(
      { error: "A vendor with this slug already exists" },
      { status: 409 }
    );
  }

  const vendor = await prisma.vendor.update({
    where: { id },
    data: {
      ...result.data,
      storefrontUrl: result.data.storefrontUrl || null,
    },
  });

  return NextResponse.json(vendor);
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
  return NextResponse.json({ success: true });
}
