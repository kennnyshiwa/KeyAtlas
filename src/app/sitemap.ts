import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { getSiteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

const PROJECTS_PER_CHUNK = 5000;

/**
 * Tell Next.js how many sitemaps exist.
 * id=0  → static pages + vendors + designers + guides + users
 * id≥1  → project chunks of PROJECTS_PER_CHUNK each
 */
export async function generateSitemaps(): Promise<{ id: number }[]> {
  try {
    const projectCount = await prisma.project.count({ where: { published: true } });
    const projectChunks = Math.ceil(projectCount / PROJECTS_PER_CHUNK) || 1;
    return Array.from({ length: 1 + projectChunks }, (_, i) => ({ id: i }));
  } catch {
    // In CI/build environments without DB, return only the static sitemap
    return [{ id: 0 }];
  }
}

export default async function sitemap({
  id,
}: {
  id: number;
}): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl().replace(/\/$/, "");

  // id=0 → static + vendors + designers + guides + users
  if (id === 0) {
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
      const [vendors, designers, guides, users] = await Promise.all([
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

      return [...staticRoutes, ...vendorRoutes, ...designerRoutes, ...guideRoutes, ...userRoutes];
    } catch {
      return staticRoutes;
    }
  }

  // id≥1 → project chunk (id=1 is chunk index 0, id=2 is chunk index 1, …)
  const chunkIndex = id - 1;
  try {
    const projects = await prisma.project.findMany({
      where: { published: true },
      select: { slug: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      skip: chunkIndex * PROJECTS_PER_CHUNK,
      take: PROJECTS_PER_CHUNK,
    });

    return projects.map((p) => ({
      url: `${siteUrl}/projects/${p.slug}`,
      lastModified: p.updatedAt,
      changeFrequency: "daily" as const,
      priority: 0.8,
    }));
  } catch {
    return [];
  }
}
