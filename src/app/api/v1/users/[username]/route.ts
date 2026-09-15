import { NextRequest, NextResponse } from "next/server";
import { requestIdentity } from "@/lib/users/request-identity";
import { prisma } from "@/lib/prisma";
import { rateLimit, RATE_LIMIT_DETAIL } from "@/lib/rate-limit";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const viewer = await requestIdentity(req);
  // This is public, but invalid explicitly supplied credentials are not silently ignored.
  if (req.headers.has("authorization") && !viewer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limited = await rateLimit(viewer?.id ?? `anonymous:${req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"}`, "v1:users:detail", RATE_LIMIT_DETAIL);
  if (limited) return limited;
  const { username } = await params;
  const profile = await prisma.user.findUnique({
    where: { username },
    select: {
      id: true, username: true, name: true, displayName: true, image: true,
      bio: true, role: true, createdAt: true,
      _count: { select: { projects: { where: { published: true } }, followers: true, following: true } },
    },
  });
  if (!profile) return NextResponse.json({ error: "User not found" }, { status: 404 });
  const following = viewer ? await prisma.follow.findUnique({
    where: { userId_targetType_targetId: {
      userId: viewer.id, targetType: "USER", targetId: profile.id,
    } },
    select: { id: true },
  }) : null;

  // Explicit response allowlist as well as a DB select: never spread a User record.
  const legacy = {
    id: profile.id, username: profile.username, name: profile.name,
    displayName: profile.displayName, image: profile.image, avatar: profile.image,
    bio: profile.bio, role: profile.role, createdAt: profile.createdAt,
    projectCount: profile._count.projects, followerCount: profile._count.followers,
    followingCount: profile._count.following,
  };
  return NextResponse.json({
    id: profile.id, username: profile.username, name: profile.name,
    displayName: profile.displayName, image: profile.image, avatar_url: profile.image,
    bio: profile.bio, role: profile.role, created_at: profile.createdAt,
    project_count: profile._count.projects, follower_count: profile._count.followers,
    following_count: profile._count.following, is_following: Boolean(following),
    // Preserve existing envelope consumers; native loadProfile decodes the root.
    data: legacy,
  }, { headers: { "Cache-Control": "private, no-store", Vary: "Authorization, Cookie" } });
}
