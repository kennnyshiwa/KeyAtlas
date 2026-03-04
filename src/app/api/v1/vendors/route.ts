import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit, RATE_LIMIT_REFERENCE } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  const limited = await rateLimit(
    req.headers.get("x-forwarded-for") ?? "anon",
    "v1:vendors",
    RATE_LIMIT_REFERENCE,
  );
  if (limited) return limited;

  const vendors = await prisma.vendor.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      storefrontUrl: true,
      verified: true,
      regionsServed: true,
      _count: { select: { projectVendors: true } },
    },
    orderBy: { name: "asc" },
  });

  const data = vendors.map((v) => ({
    id: v.id,
    name: v.name,
    slug: v.slug,
    storefrontUrl: v.storefrontUrl,
    verified: v.verified,
    regionsServed: v.regionsServed,
    projectCount: v._count.projectVendors,
  }));

  return NextResponse.json({ data });
}
