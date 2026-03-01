import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { rateLimit, RATE_LIMIT_LIST } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  const user = await authenticateApiKey(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = await rateLimit(user.id, "v1:calendar", RATE_LIMIT_LIST);
  if (limited) return limited;

  const { searchParams } = new URL(req.url);
  const monthStr = searchParams.get("month");
  const yearStr = searchParams.get("year");

  if (!monthStr || !yearStr) {
    return NextResponse.json(
      { error: "month and year query parameters are required" },
      { status: 400 }
    );
  }

  const month = Number(monthStr);
  const year = Number(yearStr);

  if (month < 1 || month > 12 || !Number.isInteger(month)) {
    return NextResponse.json({ error: "month must be 1-12" }, { status: 400 });
  }
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: "Invalid year" }, { status: 400 });
  }

  const startOfMonth = new Date(year, month - 1, 1);
  const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);

  const projects = await prisma.project.findMany({
    where: {
      published: true,
      OR: [
        { icDate: { gte: startOfMonth, lte: endOfMonth } },
        { gbStartDate: { gte: startOfMonth, lte: endOfMonth } },
        { gbEndDate: { gte: startOfMonth, lte: endOfMonth } },
        { gbStartDate: { lte: startOfMonth }, gbEndDate: { gte: endOfMonth } },
      ],
    },
    select: {
      id: true,
      title: true,
      slug: true,
      status: true,
      icDate: true,
      gbStartDate: true,
      gbEndDate: true,
    },
    orderBy: { gbStartDate: "asc" },
  });

  return NextResponse.json({ data: projects, month, year });
}
