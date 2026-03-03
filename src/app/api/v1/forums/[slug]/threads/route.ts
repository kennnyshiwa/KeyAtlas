import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { rateLimit, RATE_LIMIT_LIST, RATE_LIMIT_FORUM_THREAD_CREATE } from "@/lib/rate-limit";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const user = await authenticateApiKey(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = await rateLimit(user.id, "v1:forums:threads", RATE_LIMIT_LIST);
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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const user = await authenticateApiKey(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = await rateLimit(user.id, "v1:forums:create-thread", RATE_LIMIT_FORUM_THREAD_CREATE);
  if (limited) return limited;

  const { slug } = await params;

  const category = await prisma.forumCategory.findUnique({
    where: { slug },
    select: { id: true },
  });

  if (!category) {
    return NextResponse.json({ error: "Category not found" }, { status: 404 });
  }

  let body: { title?: string; content?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { title, content } = body;
  if (typeof title !== "string" || title.trim().length < 3) {
    return NextResponse.json({ error: "Title must be at least 3 characters" }, { status: 400 });
  }
  if (typeof content !== "string" || content.trim().length === 0) {
    return NextResponse.json({ error: "Content is required" }, { status: 400 });
  }

  const baseSlug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);

  let threadSlug = baseSlug;
  let counter = 0;
  while (await prisma.forumThread.findUnique({ where: { slug: threadSlug } })) {
    counter++;
    threadSlug = `${baseSlug}-${counter}`;
  }

  const thread = await prisma.forumThread.create({
    data: {
      title: title.trim(),
      slug: threadSlug,
      content: content.trim(),
      categoryId: category.id,
      authorId: user.id,
    },
  });

  return NextResponse.json({ data: thread }, { status: 201 });
}
