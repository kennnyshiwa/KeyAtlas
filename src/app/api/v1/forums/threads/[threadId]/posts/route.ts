import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { rateLimit, RATE_LIMIT_LIST, RATE_LIMIT_FORUM_POST_CREATE } from "@/lib/rate-limit";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const user = await authenticateApiKey(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = await rateLimit(user.id, "v1:forums:posts", RATE_LIMIT_LIST);
  if (limited) return limited;

  const { threadId } = await params;
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const limit = Math.min(Math.max(1, Number(searchParams.get("limit") ?? "20")), 50);
  const offset = (page - 1) * limit;

  const thread = await prisma.forumThread.findUnique({
    where: { id: threadId },
    select: { id: true },
  });

  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  const [posts, total] = await Promise.all([
    prisma.forumPost.findMany({
      where: { threadId },
      select: {
        id: true,
        content: true,
        createdAt: true,
        updatedAt: true,
        parentId: true,
        author: { select: { id: true, username: true, image: true } },
      },
      orderBy: { createdAt: "asc" },
      skip: offset,
      take: limit,
    }),
    prisma.forumPost.count({ where: { threadId } }),
  ]);

  return NextResponse.json({
    data: posts,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const user = await authenticateApiKey(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = await rateLimit(user.id, "v1:forums:create-post", RATE_LIMIT_FORUM_POST_CREATE);
  if (limited) return limited;

  const { threadId } = await params;

  const thread = await prisma.forumThread.findUnique({
    where: { id: threadId },
    select: { id: true, locked: true },
  });

  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  if (thread.locked) {
    return NextResponse.json({ error: "Thread is locked" }, { status: 403 });
  }

  let body: { content?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { content } = body;
  if (typeof content !== "string" || content.trim().length === 0) {
    return NextResponse.json({ error: "Content is required" }, { status: 400 });
  }

  const post = await prisma.forumPost.create({
    data: {
      content: content.trim(),
      threadId,
      authorId: user.id,
    },
    include: {
      author: { select: { id: true, username: true, image: true } },
    },
  });

  return NextResponse.json({ data: post }, { status: 201 });
}
