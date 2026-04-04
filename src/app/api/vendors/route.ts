import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { vendorFormSchema } from "@/lib/validations/vendor";
import { indexVendor } from "@/lib/meilisearch";

export async function GET() {
  const vendors = await prisma.vendor.findMany({
    include: { _count: { select: { projects: true, projectVendors: true } } },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(vendors);
}

export async function POST(req: NextRequest) {
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

  const existing = await prisma.vendor.findUnique({
    where: { slug: result.data.slug },
  });
  if (existing) {
    return NextResponse.json(
      { error: "A vendor with this slug already exists" },
      { status: 409 }
    );
  }

  const vendor = await prisma.vendor.create({
    data: {
      ...result.data,
      storefrontUrl: result.data.storefrontUrl || null,
      ownerId: session.user.id,
    },
  });

  await indexVendor(vendor);

  return NextResponse.json(vendor, { status: 201 });
}
