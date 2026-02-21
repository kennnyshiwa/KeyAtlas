import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { projectFormSchema } from "@/lib/validations/project";
import { indexProject } from "@/lib/meilisearch";
import type { ProjectCategory, ProjectStatus } from "@/generated/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const page = Number(searchParams.get("page") ?? "1");
  const limit = Math.min(Number(searchParams.get("limit") ?? "12"), 50);
  const category = searchParams.get("category") as ProjectCategory | null;
  const status = searchParams.get("status") as ProjectStatus | null;
  const featured = searchParams.get("featured");
  const offset = (page - 1) * limit;

  const where = {
    published: true,
    ...(category && { category }),
    ...(status && { status }),
    ...(featured === "true" && { featured: true }),
  };

  const [projects, total] = await Promise.all([
    prisma.project.findMany({
      where,
      include: {
        vendor: { select: { name: true, slug: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: offset,
      take: limit,
    }),
    prisma.project.count({ where }),
  ]);

  return NextResponse.json({
    projects,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
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
  const isAdmin = session.user.role === "ADMIN";
  if (!isAdmin) {
    data.published = false;
    data.featured = false;
  }

  const existing = await prisma.project.findUnique({
    where: { slug: data.slug },
  });
  if (existing) {
    return NextResponse.json(
      { error: "A project with this slug already exists" },
      { status: 409 }
    );
  }

  // Auto-set vendorId from first projectVendor for backward compat
  const primaryVendorId = projectVendors.length > 0 ? projectVendors[0].vendorId : null;

  const project = await prisma.project.create({
    data: {
      ...data,
      vendorId: primaryVendorId,
      creatorId: session.user.id,
      images: {
        create: images,
      },
      links: {
        create: links,
      },
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

  // Only index published projects in Meilisearch
  if (project.published) {
    await indexProject(project);
  }

  return NextResponse.json(project, { status: 201 });
}
