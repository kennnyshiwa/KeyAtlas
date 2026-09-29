import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const ids = url.searchParams.get("ids");

  if (!ids) {
    return NextResponse.json({ projects: [] });
  }

  const idList = ids.split(",").filter(Boolean).slice(0, 4);

  // Accept slugs as well as ids so a shared compare link reads as
  // ?ids=gmk-kantharos,gmk-cyl-hephaestus rather than a pair of cuids.
  const projects = await prisma.project.findMany({
    where: {
      published: true,
      OR: [{ id: { in: idList } }, { slug: { in: idList } }],
    },
    select: {
      id: true,
      title: true,
      slug: true,
      heroImage: true,
      category: true,
      status: true,
      priceMin: true,
      priceMax: true,
      currency: true,
      profile: true,
      profiles: true,
      designer: true,
      gbStartDate: true,
      gbEndDate: true,
      estimatedDelivery: true,
      vendor: { select: { name: true } },
    },
  });

  // findMany does not preserve the requested order, which would silently
  // reorder the columns of a shared comparison.
  const rank = new Map(idList.map((value, index) => [value, index]));
  const ordered = [...projects].sort(
    (a, b) =>
      Math.min(rank.get(a.id) ?? Infinity, rank.get(a.slug) ?? Infinity) -
      Math.min(rank.get(b.id) ?? Infinity, rank.get(b.slug) ?? Infinity)
  );

  return NextResponse.json({ projects: ordered });
}
