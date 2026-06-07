import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

async function resolveProjectId(slug: string) {
  const decodedSlug = (() => {
    try {
      return decodeURIComponent(slug);
    } catch {
      return slug;
    }
  })();

  const slugCandidates = Array.from(
    new Set([
      slug,
      decodedSlug,
      decodedSlug.normalize("NFC"),
      decodedSlug.normalize("NFD"),
    ])
  );

  return prisma.project.findFirst({
    where: { slug: { in: slugCandidates }, published: true },
    select: { id: true },
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const user = await authenticateApiKey(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;
  const project = await resolveProjectId(slug);
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.userCollection.upsert({
    where: { userId_projectId: { userId: user.id, projectId: project.id } },
    create: { userId: user.id, projectId: project.id },
    update: {},
  });

  return NextResponse.json({ is_in_collection: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const user = await authenticateApiKey(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;
  const project = await resolveProjectId(slug);
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.userCollection.deleteMany({
    where: { userId: user.id, projectId: project.id },
  });

  return NextResponse.json({ is_in_collection: false });
}
