import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { getSiteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Single sitemap — ~6K URLs is well under the 50K spec limit.
 * No generateSitemaps() needed; this serves directly at /sitemap.xml.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl().replace(/\/$/, "");

  const staticRoutes: MetadataRoute.Sitemap = [
    "",
    "/projects",
    "/forums",
    "/guides",
    "/vendors",
    "/designers",
    "/activity",
    "/compare",
    "/calendar",
    "/statistics",
    "/discover/group-buys",
    "/discover/interest-checks",
    "/discover/vendors",
    "/discover/build-guides",
    "/discover/ending-soon",
    "/discover/new-this-week",
  ].map((path) => ({
    url: `${siteUrl}${path}`,
    lastModified: new Date(),
    changeFrequency: "daily" as const,
    priority: path === "" ? 1 : 0.7,
  }));

  try {
    const [projects, vendors, designers, guides, users] = await Promise.all([
      prisma.project.findMany({
        where: { published: true },
        select: { slug: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.vendor.findMany({
        select: { slug: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.designer.findMany({
        select: { slug: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.buildGuide.findMany({
        where: { published: true },
        select: { slug: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.user.findMany({
        where: { username: { not: null } },
        select: { username: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
      }),
    ]);

    const projectRoutes: MetadataRoute.Sitemap = projects.map((p) => ({
      url: `${siteUrl}/projects/${p.slug}`,
      lastModified: p.updatedAt,
      changeFrequency: "daily" as const,
      priority: 0.8,
    }));

    const vendorRoutes: MetadataRoute.Sitemap = vendors.map((v) => ({
      url: `${siteUrl}/vendors/${v.slug}`,
      lastModified: v.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    }));

    const designerRoutes: MetadataRoute.Sitemap = designers.map((d) => ({
      url: `${siteUrl}/designers/${d.slug}`,
      lastModified: d.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    }));

    const guideRoutes: MetadataRoute.Sitemap = guides.map((g) => ({
      url: `${siteUrl}/guides/${g.slug}`,
      lastModified: g.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));

    const userRoutes: MetadataRoute.Sitemap = users
      .filter((u): u is typeof u & { username: string } => !!u.username)
      .map((u) => ({
        url: `${siteUrl}/users/${u.username}`,
        lastModified: u.updatedAt,
        changeFrequency: "weekly" as const,
        priority: 0.5,
      }));

    return [
      ...staticRoutes,
      ...projectRoutes,
      ...vendorRoutes,
      ...designerRoutes,
      ...guideRoutes,
      ...userRoutes,
    ];
  } catch (error) {
    // Log instead of silently swallowing
    console.error("[sitemap] Failed to generate dynamic entries:", error);
    return staticRoutes;
  }
}
