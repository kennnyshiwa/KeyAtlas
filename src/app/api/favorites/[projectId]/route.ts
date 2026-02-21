import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const session = await auth();

  const [count, isFavorited] = await Promise.all([
    prisma.favorite.count({ where: { projectId } }),
    session?.user
      ? prisma.favorite
          .findUnique({
            where: { userId_projectId: { userId: session.user.id, projectId } },
          })
          .then((f) => !!f)
      : Promise.resolve(false),
  ]);

  return NextResponse.json({ count, isFavorited });
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { projectId } = await params;

  await prisma.favorite.upsert({
    where: {
      userId_projectId: { userId: session.user.id, projectId },
    },
    create: { userId: session.user.id, projectId },
    update: {},
  });

  const count = await prisma.favorite.count({ where: { projectId } });
  return NextResponse.json({ count, isFavorited: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { projectId } = await params;

  await prisma.favorite.deleteMany({
    where: { userId: session.user.id, projectId },
  });

  const count = await prisma.favorite.count({ where: { projectId } });
  return NextResponse.json({ count, isFavorited: false });
}
