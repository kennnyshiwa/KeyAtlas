import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { rateLimit, RATE_LIMIT_REFERENCE } from "@/lib/rate-limit";
import { ProjectCategory } from "@/generated/prisma";

const CATEGORY_LABELS: Record<ProjectCategory, string> = {
  KEYBOARDS: "Keyboards",
  KEYCAPS: "Keycaps",
  SWITCHES: "Switches",
  DESKMATS: "Deskmats",
  ARTISANS: "Artisans",
  ACCESSORIES: "Accessories",
};

export async function GET(req: NextRequest) {
  const user = await authenticateApiKey(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = rateLimit(user.id, "v1:categories", RATE_LIMIT_REFERENCE);
  if (limited) return limited;

  const counts = await prisma.project.groupBy({
    by: ["category"],
    where: { published: true },
    _count: { _all: true },
  });

  const countMap = new Map(counts.map((c) => [c.category, c._count._all]));

  const data = Object.values(ProjectCategory).map((category) => ({
    category,
    label: CATEGORY_LABELS[category],
    count: countMap.get(category) ?? 0,
  }));

  return NextResponse.json({ data });
}
