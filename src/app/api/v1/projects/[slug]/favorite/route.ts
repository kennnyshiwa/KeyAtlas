import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { rateLimit, RATE_LIMIT_FOLLOW } from "@/lib/rate-limit";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const user = await authenticateApiKey(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = await rateLimit(user.id, "v1:favorite", RATE_LIMIT_FOLLOW);
  if (limited) return limited;

  const { slug } = await params;

  const project = await prisma.project.findUnique({
    where: { slug, published: true },
    select: { id: true },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  await prisma.favorite.upsert({
    where: {
      userId_projectId: { userId: user.id, projectId: project.id },
    },
    create: { userId: user.id, projectId: project.id },
    update: {},
  });

  const count = await prisma.favorite.count({ where: { projectId: project.id } });

  return NextResponse.json({ data: { favorited: true, count } }, { status: 201 });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const user = await authenticateApiKey(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = await rateLimit(user.id, "v1:favorite", RATE_LIMIT_FOLLOW);
  if (limited) return limited;

  const { slug } = await params;

  const project = await prisma.project.findUnique({
    where: { slug, published: true },
    select: { id: true },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  await prisma.favorite.deleteMany({
    where: { userId: user.id, projectId: project.id },
  });

  const count = await prisma.favorite.count({ where: { projectId: project.id } });

  return NextResponse.json({ data: { favorited: false, count } });
}
