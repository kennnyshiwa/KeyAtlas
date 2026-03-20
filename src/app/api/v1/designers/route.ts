import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit, RATE_LIMIT_REFERENCE } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  const limited = await rateLimit(
    req.headers.get("x-forwarded-for") ?? "anon",
    "v1:designers",
    RATE_LIMIT_REFERENCE,
  );
  if (limited) return limited;

  const designers = await prisma.designer.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      logo: true,
      banner: true,
      description: true,
      websiteUrl: true,
      _count: { select: { projects: true } },
    },
    orderBy: { name: "asc" },
  });

  const data = designers.map((d) => ({
    id: d.id,
    name: d.name,
    slug: d.slug,
    description: d.description,
    logo_url: d.logo,
    banner_url: d.banner,
    website_url: d.websiteUrl,
    project_count: d._count.projects,
  }));

  return NextResponse.json({ data });
}
