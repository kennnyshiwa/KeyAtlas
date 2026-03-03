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

  const limited = await rateLimit(user.id, "v1:follow", RATE_LIMIT_FOLLOW);
  if (limited) return limited;

  const { slug } = await params;

  const project = await prisma.project.findUnique({
    where: { slug, published: true },
    select: { id: true },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const existing = await prisma.follow.findUnique({
    where: {
      userId_targetType_targetId: {
        userId: user.id,
        targetType: "PROJECT",
        targetId: project.id,
      },
    },
  });

  if (existing) {
    return NextResponse.json({ data: { following: true } });
  }

  await prisma.follow.create({
    data: {
      userId: user.id,
      targetType: "PROJECT",
      targetId: project.id,
      targetProjectId: project.id,
    },
  });

  return NextResponse.json({ data: { following: true } }, { status: 201 });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const user = await authenticateApiKey(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = await rateLimit(user.id, "v1:follow", RATE_LIMIT_FOLLOW);
  if (limited) return limited;

  const { slug } = await params;

  const project = await prisma.project.findUnique({
    where: { slug, published: true },
    select: { id: true },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  await prisma.follow.deleteMany({
    where: {
      userId: user.id,
      targetType: "PROJECT",
      targetId: project.id,
    },
  });

  return NextResponse.json({ data: { following: false } });
}
