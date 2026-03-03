import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { rateLimit, RATE_LIMIT_REFERENCE } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  const user = await authenticateApiKey(req).catch(() => null);
  const rateLimitKey = user?.id ?? (req.headers.get("x-forwarded-for") ?? "anon");
  const limited = await rateLimit(rateLimitKey, "v1:forums", RATE_LIMIT_REFERENCE);
  if (limited) return limited;

  const categories = await prisma.forumCategory.findMany({
    orderBy: { order: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      icon: true,
      order: true,
      _count: { select: { threads: true } },
    },
  });

  const data = categories.map(({ _count, ...rest }) => ({
    ...rest,
    threadCount: _count.threads,
  }));

  return NextResponse.json({ data });
}
