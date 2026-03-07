import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { rateLimit, RATE_LIMIT_REFERENCE } from "@/lib/rate-limit";
import { ProjectCategory } from "@/generated/prisma/client";

const CATEGORY_LABELS: Record<ProjectCategory, string> = {
  KEYBOARDS: "Keyboards",
  KEYCAPS: "Keycaps",
  SWITCHES: "Switches",
  DESKMATS: "Deskmats",
  ARTISANS: "Artisans",
  ACCESSORIES: "Accessories",
};

export async function GET(req: NextRequest) {
  // Allow unauthenticated access (categories are public reference data)
  // but prefer authenticated for rate limiting by user
  const user = await authenticateApiKey(req);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
  const limitKey = user?.id ?? ip;
  const limited = await rateLimit(limitKey, "v1:categories", RATE_LIMIT_REFERENCE);
  if (limited) return limited;

  const counts = await prisma.project.groupBy({
    by: ["category"],
    where: { published: true },
    _count: { _all: true },
  });

  const countMap = new Map(counts.map((c) => [c.category, c._count._all]));

  const data = Object.values(ProjectCategory).map((category) => ({
    id: category,
    name: CATEGORY_LABELS[category],
    slug: category.toLowerCase(),
    count: countMap.get(category) ?? 0,
  }));

  return NextResponse.json({ data });
}
