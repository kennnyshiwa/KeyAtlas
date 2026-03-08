import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { vendorFormSchema } from "@/lib/validations/vendor";

export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const vendors = await prisma.vendor.findMany({
    include: { _count: { select: { projects: true, projectVendors: true } } },
    orderBy: { name: "asc" },
  });

  const mapped = vendors.map((v) => ({
    id: v.id,
    name: v.name,
    slug: v.slug,
    website: v.storefrontUrl,
    region: v.regionsServed?.[0] ?? null,
    logo: v.logo,
    project_count: v._count.projects + v._count.projectVendors,
    created_at: v.createdAt.toISOString(),
  }));

  return NextResponse.json({ data: mapped });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await req.json();

  // Map iOS field names to schema names
  const mapped = {
    ...body,
    storefrontUrl: body.storefrontUrl ?? body.website ?? null,
    regionsServed: body.regionsServed ?? (body.region ? [body.region] : []),
  };
  delete mapped.website;
  delete mapped.region;

  const result = vendorFormSchema.safeParse(mapped);

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

  return NextResponse.json({ data: vendor }, { status: 201 });
}
