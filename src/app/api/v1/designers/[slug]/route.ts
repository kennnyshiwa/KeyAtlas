import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { rateLimit, RATE_LIMIT_DETAIL } from "@/lib/rate-limit";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const user = await authenticateApiKey(req).catch(() => null);

  const limited = await rateLimit(
    user?.id ?? (req.headers.get("x-forwarded-for") ?? "anon"),
    "v1:designers:detail",
    RATE_LIMIT_DETAIL,
  );
  if (limited) return limited;

  const { slug } = await params;

  const designer = await prisma.designer.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      slug: true,
      logo: true,
      banner: true,
      description: true,
      websiteUrl: true,
      createdAt: true,
      projects: {
        where: { published: true },
        select: {
          id: true,
          title: true,
          slug: true,
          status: true,
          heroImage: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!designer) {
    return NextResponse.json({ error: "Designer not found" }, { status: 404 });
  }

  return NextResponse.json({
    data: {
      id: designer.id,
      name: designer.name,
      slug: designer.slug,
      description: designer.description,
      logo_url: designer.logo,
      banner_url: designer.banner,
      website_url: designer.websiteUrl,
      created_at: designer.createdAt.toISOString(),
      projects: designer.projects.map((p) => ({
        id: p.id,
        title: p.title,
        slug: p.slug,
        status: p.status,
        hero_image_url: p.heroImage,
        created_at: p.createdAt.toISOString(),
        updated_at: p.updatedAt.toISOString(),
      })),
    },
  });
}
