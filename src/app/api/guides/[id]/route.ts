import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

interface RouteCtx {
  params: Promise<{ id: string }>;
}

const updateSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(100000),
  difficulty: z.string().max(50).nullable().optional(),
  heroImage: z.string().url().nullable().optional(),
});

export async function PUT(req: NextRequest, { params }: RouteCtx) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const guide = await prisma.buildGuide.findUnique({
    where: { id },
    select: { id: true, slug: true, authorId: true },
  });

  if (!guide) {
    return NextResponse.json({ error: "Guide not found" }, { status: 404 });
  }

  const isOwner = guide.authorId === session.user.id;
  const isAdmin = session.user.role === "ADMIN";

  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  }

  const { title, content, difficulty, heroImage } = parsed.data;

  const updated = await prisma.buildGuide.update({
    where: { id: guide.id },
    data: {
      title,
      content,
      difficulty: difficulty ?? null,
      heroImage: heroImage ?? null,
    },
    select: { id: true, slug: true, title: true },
  });

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: RouteCtx) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const guide = await prisma.buildGuide.findUnique({
    where: { id },
    select: { id: true, authorId: true },
  });

  if (!guide) {
    return NextResponse.json({ error: "Guide not found" }, { status: 404 });
  }

  const isOwner = guide.authorId === session.user.id;
  const isAdmin = session.user.role === "ADMIN";

  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.buildGuide.delete({ where: { id: guide.id } });

  return NextResponse.json({ success: true });
}
