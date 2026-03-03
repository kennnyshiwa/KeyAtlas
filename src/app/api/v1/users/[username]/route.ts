import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { rateLimit, RATE_LIMIT_DETAIL } from "@/lib/rate-limit";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const user = await authenticateApiKey(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = await rateLimit(user.id, "v1:users:detail", RATE_LIMIT_DETAIL);
  if (limited) return limited;

  const { username } = await params;

  const profile = await prisma.user.findUnique({
    where: { username },
    select: {
      id: true,
      username: true,
      displayName: true,
      image: true,
      bio: true,
      role: true,
      createdAt: true,
      _count: {
        select: {
          projects: true,
          followers: true,
          following: true,
        },
      },
    },
  });

  if (!profile) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const { _count, ...rest } = profile;

  return NextResponse.json({
    data: {
      ...rest,
      avatar: rest.image,
      projectCount: _count.projects,
      followerCount: _count.followers,
      followingCount: _count.following,
    },
  });
}
