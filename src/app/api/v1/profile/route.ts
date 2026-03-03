import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { rateLimit, RATE_LIMIT_DETAIL } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  const user = await authenticateApiKey(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = await rateLimit(user.id, "v1:profile", RATE_LIMIT_DETAIL);
  if (limited) return limited;

  const profile = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      username: true,
      email: true,
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
    return NextResponse.json({ error: "Not found" }, { status: 404 });
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
