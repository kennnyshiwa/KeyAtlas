import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { vendorFormSchema } from "@/lib/validations/vendor";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await authenticateApiKey(req);
  if (!user || user.role !== "ADMIN") {
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

  return NextResponse.json({ data: vendor });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await authenticateApiKey(req);
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  await prisma.vendor.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
