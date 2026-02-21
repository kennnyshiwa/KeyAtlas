import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const ids = url.searchParams.get("ids");

  if (!ids) {
    return NextResponse.json({ projects: [] });
  }

  const idList = ids.split(",").filter(Boolean).slice(0, 4);

  const projects = await prisma.project.findMany({
    where: { id: { in: idList }, published: true },
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
      designer: true,
      gbStartDate: true,
      gbEndDate: true,
      estimatedDelivery: true,
      vendor: { select: { name: true } },
    },
  });

  return NextResponse.json({ projects });
}
