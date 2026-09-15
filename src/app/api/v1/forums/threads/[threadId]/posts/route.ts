import { createForumPost } from "@/lib/forums/create";
import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { rateLimit, RATE_LIMIT_LIST } from "@/lib/rate-limit";

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

export async function POST(req: NextRequest, { params }: { params: Promise<{ threadId: string }> }) {
  return createForumPost(req, (await params).threadId);
}
