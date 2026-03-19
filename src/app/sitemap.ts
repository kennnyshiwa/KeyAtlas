import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { getSiteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

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
    changeFrequency: "daily",
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

    const projectRoutes: MetadataRoute.Sitemap = projects.map((project) => ({
      url: `${siteUrl}/projects/${project.slug}`,
      lastModified: project.updatedAt,
      changeFrequency: "daily",
      priority: 0.8,
    }));

    const vendorRoutes: MetadataRoute.Sitemap = vendors.map((vendor) => ({
      url: `${siteUrl}/vendors/${vendor.slug}`,
      lastModified: vendor.updatedAt,
      changeFrequency: "weekly",
      priority: 0.6,
    }));

    const designerRoutes: MetadataRoute.Sitemap = designers.map((designer) => ({
      url: `${siteUrl}/designers/${designer.slug}`,
      lastModified: designer.updatedAt,
      changeFrequency: "weekly",
      priority: 0.6,
    }));

    const guideRoutes: MetadataRoute.Sitemap = guides.map((guide) => ({
      url: `${siteUrl}/guides/${guide.slug}`,
      lastModified: guide.updatedAt,
      changeFrequency: "weekly",
      priority: 0.7,
    }));

    const userRoutes: MetadataRoute.Sitemap = users
      .filter((user) => !!user.username)
      .map((user) => ({
        url: `${siteUrl}/users/${user.username}`,
        lastModified: user.updatedAt,
        changeFrequency: "weekly",
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
  } catch {
    // In CI/build environments without DB connectivity, return static routes so build can succeed.
    return staticRoutes;
  }
}
