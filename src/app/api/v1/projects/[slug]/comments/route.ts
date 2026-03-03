import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { rateLimit, RATE_LIMIT_LIST, RATE_LIMIT_COMMENT_CREATE } from "@/lib/rate-limit";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const user = await authenticateApiKey(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = await rateLimit(user.id, "v1:comments:list", RATE_LIMIT_LIST);
  if (limited) return limited;

  const { slug } = await params;
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const limit = Math.min(Math.max(1, Number(searchParams.get("limit") ?? "20")), 50);
  const offset = (page - 1) * limit;

  const project = await prisma.project.findUnique({
    where: { slug, published: true },
    select: { id: true },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const [comments, total] = await Promise.all([
    prisma.comment.findMany({
      where: { projectId: project.id, parentId: null },
      include: {
        user: { select: { id: true, username: true, image: true } },
        replies: {
          include: {
            user: { select: { id: true, username: true, image: true } },
          },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: offset,
      take: limit,
    }),
    prisma.comment.count({ where: { projectId: project.id, parentId: null } }),
  ]);

  return NextResponse.json({
    data: comments,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
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

  const limited = await rateLimit(user.id, "v1:comments:create", RATE_LIMIT_COMMENT_CREATE);
  if (limited) return limited;

  const { slug } = await params;

  const project = await prisma.project.findUnique({
    where: { slug, published: true },
    select: { id: true },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  let body: { content?: string; parentId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { content, parentId } = body;
  if (typeof content !== "string" || content.trim().length === 0) {
    return NextResponse.json({ error: "Content is required" }, { status: 400 });
  }

  const comment = await prisma.comment.create({
    data: {
      content: content.trim(),
      userId: user.id,
      projectId: project.id,
      parentId: parentId ?? null,
    },
    include: {
      user: { select: { id: true, username: true, image: true } },
    },
  });

  return NextResponse.json({ data: comment }, { status: 201 });
}
