import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { designerFormSchema } from "@/lib/validations/designer";
import { indexDesigner } from "@/lib/meilisearch";

export async function GET() {
  const designers = await prisma.designer.findMany({
    include: { _count: { select: { projects: true } } },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(designers);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
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

  const existing = await prisma.designer.findUnique({
    where: { slug: result.data.slug },
  });
  if (existing) {
    return NextResponse.json(
      { error: "A designer with this slug already exists" },
      { status: 409 }
    );
  }

  const designer = await prisma.designer.create({
    data: {
      name: result.data.name,
      slug: result.data.slug,
      logo: result.data.logo || null,
      banner: result.data.banner || null,
      description: result.data.description || null,
      websiteUrl: result.data.websiteUrl || null,
    },
  });

  await indexDesigner(designer);

  return NextResponse.json(designer, { status: 201 });
}
