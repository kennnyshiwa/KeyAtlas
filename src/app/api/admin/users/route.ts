import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { UserRole } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/admin-auth";

const querySchema = z.object({
  q: z.string().trim().max(100).optional(),
  role: z.nativeEnum(UserRole).optional(),
  status: z.enum(["active", "banned"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export async function GET(req: NextRequest) {
  const access = await requireAdminSession();
  if (!access.ok) {
    return NextResponse.json({ error: access.error, message: access.message }, { status: access.status });
  }

  const parsed = querySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", message: "Invalid query params", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { q, role, status, page, pageSize } = parsed.data;
  const where = {
    ...(q
      ? {
          OR: [
            { email: { contains: q, mode: "insensitive" as const } },
            { name: { contains: q, mode: "insensitive" as const } },
            { displayName: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(role ? { role } : {}),
    ...(status === "banned" ? { bannedAt: { not: null } } : {}),
    ...(status === "active" ? { bannedAt: null } : {}),
  };

  const skip = (page - 1) * pageSize;
  const [total, users] = await prisma.$transaction([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
      select: {
        id: true,
        email: true,
        name: true,
        displayName: true,
        username: true,
        role: true,
        createdAt: true,
        lastSeenAt: true,
        emailVerified: true,
        bannedAt: true,
      },
    }),
  ]);

  return NextResponse.json({
    data: users,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  });
}
