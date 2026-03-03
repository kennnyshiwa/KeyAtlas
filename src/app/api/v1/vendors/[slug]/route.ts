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

  const limited = await rateLimit(user.id, "v1:vendors:detail", RATE_LIMIT_DETAIL);
  if (limited) return limited;

  const { slug } = await params;

  const vendor = await prisma.vendor.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      slug: true,
      logo: true,
      description: true,
      storefrontUrl: true,
      verified: true,
      regionsServed: true,
      createdAt: true,
      projectVendors: {
        where: { project: { published: true } },
        select: {
          region: true,
          storeLink: true,
          project: {
            select: {
              id: true,
              title: true,
              slug: true,
              category: true,
              status: true,
              heroImage: true,
            },
          },
        },
        orderBy: { project: { createdAt: "desc" } },
      },
    },
  });

  if (!vendor) {
    return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
  }

  const { projectVendors, ...rest } = vendor;

  return NextResponse.json({
    data: {
      ...rest,
      projects: projectVendors.map((pv) => ({
        ...pv.project,
        region: pv.region,
        storeLink: pv.storeLink,
      })),
    },
  });
}
