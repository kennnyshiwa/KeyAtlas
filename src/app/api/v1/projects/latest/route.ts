import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { rateLimit, RATE_LIMIT_LATEST } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  const user = await authenticateApiKey(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = await rateLimit(user.id, "v1:projects:latest", RATE_LIMIT_LATEST);
  if (limited) return limited;

  const { searchParams } = new URL(req.url);
  const limit = Math.min(Math.max(1, Number(searchParams.get("limit") ?? "10")), 25);

  const projects = await prisma.project.findMany({
    where: { published: true },
    select: {
      id: true,
      title: true,
      slug: true,
      category: true,
      status: true,
      priceMin: true,
      priceMax: true,
      currency: true,
      heroImage: true,
      designer: true,
      profile: true,
      shipped: true,
      tags: true,
      gbStartDate: true,
      gbEndDate: true,
      icDate: true,
      createdAt: true,
      vendor: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  const data = projects.map((p) => ({
    ...p,
    vendorName: p.vendor?.name ?? null,
    vendor: undefined,
  }));

  return NextResponse.json({ data });
}
