import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ following: false });
  }

  const targetType = req.nextUrl.searchParams.get("targetType");
  const targetId = req.nextUrl.searchParams.get("targetId");

  if (!targetType || !targetId) {
    return NextResponse.json({ following: false });
  }

  const existing = await prisma.follow.findUnique({
    where: {
      userId_targetType_targetId: {
        userId: session.user.id,
        targetType: targetType as "USER" | "PROJECT" | "VENDOR" | "FORUM_THREAD" | "FORUM_CATEGORY",
        targetId,
      },
    },
  });

  return NextResponse.json({ following: !!existing });
}
