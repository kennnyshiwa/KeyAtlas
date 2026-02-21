import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { validateForumContentSafety } from "@/lib/forums/anti-spam";
import { rateLimit, RATE_LIMIT_FORUM_THREAD_CREATE } from "@/lib/rate-limit";
import { dispatchNotification } from "@/lib/notifications/service";

const createThreadSchema = z.object({
  title: z.string().min(3).max(200),
  content: z.string().min(1).max(50000),
});

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ categorySlug: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = rateLimit(session.user.id, "forum:create-thread", RATE_LIMIT_FORUM_THREAD_CREATE);
  if (limited) return limited;

  const { categorySlug } = await params;
  const category = await prisma.forumCategory.findUnique({
    where: { slug: categorySlug },
    select: { id: true, slug: true, name: true },
  });

  if (!category) {
    return NextResponse.json({ error: "Category not found" }, { status: 404 });
  }

  const body = await req.json();
  const parsed = createThreadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid data", details: parsed.error.flatten() }, { status: 400 });
  }

  const { title, content } = parsed.data;

  const safetyCheck = await validateForumContentSafety(session.user.id, content, title);
  if (safetyCheck) {
    return NextResponse.json(
      { error: safetyCheck.message, code: "FORUM_CONTENT_REJECTED" },
      { status: safetyCheck.status }
    );
  }

  const baseSlug = slugify(title);
  
  // Ensure unique slug
  let slug = baseSlug;
  let counter = 0;
  while (await prisma.forumThread.findUnique({ where: { slug } })) {
    counter++;
    slug = `${baseSlug}-${counter}`;
  }

  const thread = await prisma.forumThread.create({
    data: {
      title,
      slug,
      content,
      categoryId: category.id,
      authorId: session.user.id,
    },
  });

  const followers = await prisma.follow.findMany({
    where: {
      targetType: "FORUM_CATEGORY",
      targetId: category.id,
    },
    select: { userId: true },
  });

  await dispatchNotification({
    recipients: followers.map((f) => f.userId),
    actorId: session.user.id,
    preferenceType: "FORUM_CATEGORY_THREADS",
    notificationType: "NEW_FORUM_THREAD",
    title: "New thread in followed category",
    message: `${session.user.name || "Someone"} posted "${title}" in ${category.name}.`,
    link: `/forums/${category.slug}/${thread.slug}`,
    emailSubject: `New KeyAtlas forum thread: ${title}`,
    emailHeading: `New thread in ${category.name}`,
    emailCtaLabel: "View thread",
  });

  return NextResponse.json(thread, { status: 201 });
}
