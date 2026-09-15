import { NextRequest, NextResponse } from "next/server";
import { addDays } from "date-fns";
import { authenticateApiKey } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { rateLimit, RATE_LIMIT_LIST } from "@/lib/rate-limit";
import { scoreFollowedProjectRecommendation } from "@/lib/project-discovery";
import { projectCardSelect, projectCards, privateViewerResponse } from "@/lib/v1-project-cards";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    return await getProjects(req);
  } catch {
    // Never expose database/auth internals or bypass personalized cache policy.
    return privateViewerResponse(NextResponse.json({ error: "Internal server error" }, { status: 500 }));
  }
}

async function getProjects(req: NextRequest) {
  const user = await authenticateApiKey(req);
  if (!user) return privateViewerResponse(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
  const limited = await rateLimit(user.id, "v1:discover:recommended", RATE_LIMIT_LIST);
  if (limited) return privateViewerResponse(limited);

  const now = new Date();
  // Keep the website's policy: latest published followed relation, ALL follow
  // exclusions, newest 48 candidates BEFORE category filtering, unchanged scorer.
  const [follows, anchorFollow] = await Promise.all([
    prisma.follow.findMany({ where: { userId: user.id, targetType: "PROJECT" }, select: { targetId: true } }),
    prisma.follow.findFirst({
      where: { userId: user.id, targetType: "PROJECT", targetProject: { published: true } },
      select: { targetProject: { select: { id: true, title: true, category: true, status: true, profile: true, profiles: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const anchor = anchorFollow?.targetProject;
  if (!anchor) return privateViewerResponse(NextResponse.json({ anchor_title: null, data: [] }));
  const candidates = await prisma.project.findMany({
    where: { published: true, updatedAt: { gte: addDays(now, -90) } },
    select: { ...projectCardSelect, _count: { select: { favorites: true, followers: true, comments: true, updates: true } } },
    orderBy: { updatedAt: "desc" },
    take: 48,
  });
  const followedIds = new Set(follows.map((f) => f.targetId));
  const score = (p: (typeof candidates)[number]) => scoreFollowedProjectRecommendation(anchor, {
    category: p.category, status: p.status, profile: p.profile, profiles: p.profiles,
    favoritesCount: p._count.favorites, followersCount: p._count.followers,
    commentsCount: p._count.comments, updatesCount: p._count.updates,
    updatedAt: p.updatedAt, createdAt: p.createdAt,
  }, now);
  const ranked = candidates
    .filter((p) => !followedIds.has(p.id) && p.id !== anchor.id && p.category === anchor.category)
    .sort((a, b) => score(b) - score(a) || b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, 10);
  return privateViewerResponse(NextResponse.json({ anchor_title: anchor.title, data: await projectCards(ranked, user.id) }));
}
