import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const guideSchema = z.object({
  title: z.string().min(3).max(200),
  content: z.string().min(1).max(100000),
  difficulty: z.string().max(50).nullable().optional(),
  heroImage: z.string().url().nullable().optional(),
});

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = guideSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  }

  const { title, content, difficulty, heroImage } = parsed.data;
  const baseSlug = slugify(title);

  let slug = baseSlug;
  let counter = 0;
  while (await prisma.buildGuide.findUnique({ where: { slug } })) {
    counter++;
    slug = `${baseSlug}-${counter}`;
  }

  const guide = await prisma.buildGuide.create({
    data: {
      title,
      slug,
      content,
      difficulty: difficulty ?? null,
      heroImage: heroImage ?? null,
      authorId: session.user.id,
      published: true, // Auto-publish for now
    },
  });

  return NextResponse.json(guide, { status: 201 });
}
