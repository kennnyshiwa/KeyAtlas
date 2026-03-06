import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { rateLimit, RATE_LIMIT_LIST } from "@/lib/rate-limit";
import { buildAuditLogWhere, parseAuditLogQueryParams } from "@/lib/admin-audit-log-filters";

function escapeCsv(value: unknown) {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

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

  const limited = await rateLimit(user.id, "v1:admin:audit-logs:export", RATE_LIMIT_LIST);
  if (limited) return limited;

  const { searchParams } = new URL(req.url);
  const params = parseAuditLogQueryParams(searchParams);
  const where = buildAuditLogWhere(params);

  const logs = await prisma.adminAuditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 5000,
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
  });

  const headers = [
    "id",
    "createdAt",
    "actorId",
    "actorName",
    "actorEmail",
    "actorRole",
    "action",
    "resource",
    "resourceId",
    "targetId",
    "ipAddress",
    "userAgent",
    "metadata",
  ];

  const rows = logs.map((log) => [
    log.id,
    log.createdAt.toISOString(),
    log.actorId,
    log.actor.displayName || log.actor.username || log.actor.id,
    log.actor.email || "",
    log.actorRole,
    log.action,
    log.resource,
    log.resourceId || "",
    log.targetId || "",
    log.ipAddress || "",
    log.userAgent || "",
    log.metadata ? JSON.stringify(log.metadata) : "",
  ]);

  const csv = [headers, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\n");

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="admin-audit-logs-${timestamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
