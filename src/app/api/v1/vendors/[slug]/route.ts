import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { rateLimit, RATE_LIMIT_DETAIL } from "@/lib/rate-limit";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const user = await authenticateApiKey(req).catch(() => null);

  const limited = await rateLimit(user?.id ?? (req.headers.get("x-forwarded-for") ?? "anon"), "v1:vendors:detail", RATE_LIMIT_DETAIL);
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
              status: true,
              heroImage: true,
              createdAt: true,
              updatedAt: true,
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
        id: pv.project.id,
        title: pv.project.title,
        slug: pv.project.slug,
        status: pv.project.status,
        hero_image_url: pv.project.heroImage,
        created_at: pv.project.createdAt.toISOString(),
        updated_at: pv.project.updatedAt.toISOString(),
        region: pv.region,
        store_link: pv.storeLink,
      })),
    },
  });
}
