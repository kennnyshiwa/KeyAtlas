import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const session = await auth();

  const isCollected = session?.user
    ? await prisma.userCollection
        .findUnique({
          where: {
            userId_projectId: { userId: session.user.id, projectId },
          },
        })
        .then((c) => !!c)
    : false;

  return NextResponse.json({ isCollected });
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

  await prisma.userCollection.upsert({
    where: {
      userId_projectId: { userId: session.user.id, projectId },
    },
    create: { userId: session.user.id, projectId },
    update: {},
  });

  return NextResponse.json({ isCollected: true });
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

  await prisma.userCollection.deleteMany({
    where: { userId: session.user.id, projectId },
  });

  return NextResponse.json({ isCollected: false });
}
