import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { rateLimit, RATE_LIMIT_DETAIL } from "@/lib/rate-limit";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const user = await authenticateApiKey(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = await rateLimit(user.id, "v1:guides:detail", RATE_LIMIT_DETAIL);
  if (limited) return limited;

  const { slug } = await params;

  const guide = await prisma.buildGuide.findUnique({
    where: { slug, published: true },
    select: {
      id: true,
      title: true,
      slug: true,
      content: true,
      heroImage: true,
      difficulty: true,
      createdAt: true,
      updatedAt: true,
      author: { select: { id: true, username: true, image: true } },
    },
  });

  if (!guide) {
    return NextResponse.json({ error: "Guide not found" }, { status: 404 });
  }

  return NextResponse.json({ data: guide });
}
