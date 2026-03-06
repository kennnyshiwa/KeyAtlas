import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { rateLimit, RATE_LIMIT_LIST } from "@/lib/rate-limit";
import { buildAuditLogWhere, parseAuditLogQueryParams } from "@/lib/admin-audit-log-filters";

export async function GET(req: NextRequest) {
  const user = await authenticateApiKey(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { role: true },
  });

  if (!dbUser || !["ADMIN", "MODERATOR"].includes(dbUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const limited = await rateLimit(user.id, "v1:admin:audit-logs", RATE_LIMIT_LIST);
  if (limited) return limited;

  const { searchParams } = new URL(req.url);
  const params = parseAuditLogQueryParams(searchParams);
  const offset = (params.page - 1) * params.limit;
  const where = buildAuditLogWhere(params);

  const [logs, total] = await Promise.all([
    prisma.adminAuditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: offset,
      take: params.limit,
      include: {
        actor: {
          select: {
            id: true,
            username: true,
            displayName: true,
            email: true,
          },
        },
      },
    }),
    prisma.adminAuditLog.count({ where }),
  ]);

  const totalPages = Math.ceil(total / params.limit);

  return NextResponse.json({
    data: logs.map((log) => ({
      id: log.id,
      actorId: log.actorId,
      actorRole: log.actorRole,
      action: log.action,
      resource: log.resource,
      resourceId: log.resourceId,
      targetId: log.targetId,
      metadata: log.metadata ? JSON.stringify(log.metadata) : null,
      ipAddress: log.ipAddress,
      userAgent: log.userAgent,
      createdAt: log.createdAt,
      actor: {
        id: log.actor.id,
        username: log.actor.username,
        displayName: log.actor.displayName,
        email: log.actor.email,
      },
    })),
    pagination: {
      page: params.page,
      limit: params.limit,
      total,
      totalPages,
      hasNextPage: params.page < totalPages,
      hasPrevPage: params.page > 1,
      nextPage: params.page < totalPages ? params.page + 1 : null,
      prevPage: params.page > 1 ? params.page - 1 : null,
    },
    filters: {
      actorRole: params.actorRole ?? null,
      action: params.action ?? null,
      resource: params.resource ?? null,
      from: params.from ?? null,
      to: params.to ?? null,
    },
  });
}
