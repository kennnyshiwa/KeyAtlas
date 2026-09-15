import { createForumThread } from "@/lib/forums/create";
import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { rateLimit, RATE_LIMIT_LIST } from "@/lib/rate-limit";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const user = await authenticateApiKey(req).catch(() => null);
  const rateLimitKey = user?.id ?? (req.headers.get("x-forwarded-for") ?? "anon");
  const limited = await rateLimit(rateLimitKey, "v1:forums:threads", RATE_LIMIT_LIST);
  if (limited) return limited;

  const { slug } = await params;
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const limit = Math.min(Math.max(1, Number(searchParams.get("limit") ?? "20")), 50);
  const offset = (page - 1) * limit;

  const category = await prisma.forumCategory.findUnique({
    where: { slug },
    select: { id: true },
  });

  if (!category) {
    return NextResponse.json({ error: "Category not found" }, { status: 404 });
  }

  const [threads, total] = await Promise.all([
    prisma.forumThread.findMany({
      where: { categoryId: category.id },
      select: {
        id: true,
        title: true,
        slug: true,
        pinned: true,
        locked: true,
        views: true,
        createdAt: true,
        updatedAt: true,
        author: { select: { id: true, username: true, image: true } },
        _count: { select: { posts: true } },
      },
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
      skip: offset,
      take: limit,
    }),
    prisma.forumThread.count({ where: { categoryId: category.id } }),
  ]);

  const data = threads.map(({ _count, ...rest }) => ({
    ...rest,
    postCount: _count.posts,
  }));

  return NextResponse.json({
    data,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  return createForumThread(req, (await params).slug);
}
