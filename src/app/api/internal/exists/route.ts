import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");
  const slug = searchParams.get("slug");

  if (!type || !slug) {
    return NextResponse.json({ error: "Missing type or slug" }, { status: 400 });
  }

  if (type === "project") {
    const exists = await prisma.project.findFirst({
      where: { slug, published: true },
      select: { id: true },
    });
    return exists
      ? NextResponse.json({ exists: true })
      : NextResponse.json({ exists: false }, { status: 404 });
  }

  if (type === "user") {
    const exists = await prisma.user.findFirst({
      where: { username: slug },
      select: { id: true },
    });
    return exists
      ? NextResponse.json({ exists: true })
      : NextResponse.json({ exists: false }, { status: 404 });
  }

  if (type === "forum") {
    const exists = await prisma.forumCategory.findFirst({
      where: { slug },
      select: { id: true },
    });
    return exists
      ? NextResponse.json({ exists: true })
      : NextResponse.json({ exists: false }, { status: 404 });
  }

  return NextResponse.json({ error: "Invalid type" }, { status: 400 });
}
