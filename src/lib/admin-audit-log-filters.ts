import type { Prisma, UserRole } from "@/generated/prisma/client";

const USER_ROLES: UserRole[] = ["USER", "VENDOR", "MODERATOR", "ADMIN"];

function parsePositiveInt(value: string | null, fallback: number, max: number) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(1, Math.floor(parsed)), max);
}

function parseDate(value: string | null, { endOfDay = false }: { endOfDay?: boolean } = {}) {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const isoDateOnly = /^\d{4}-\d{2}-\d{2}$/;
  const normalized = isoDateOnly.test(trimmed)
    ? `${trimmed}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`
    : trimmed;

  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export interface AuditLogQueryParams {
  actorRole?: UserRole;
  action?: string;
  resource?: string;
  from?: string;
  to?: string;
  page: number;
  limit: number;
}

export function parseAuditLogQueryParams(searchParams: URLSearchParams): AuditLogQueryParams {
  const actorRoleParam = (searchParams.get("actorRole") || "").trim().toUpperCase();
  const actorRole = USER_ROLES.includes(actorRoleParam as UserRole)
    ? (actorRoleParam as UserRole)
    : undefined;

  return {
    actorRole,
    action: (searchParams.get("action") || "").trim() || undefined,
    resource: (searchParams.get("resource") || "").trim() || undefined,
    from: (searchParams.get("from") || "").trim() || undefined,
    to: (searchParams.get("to") || "").trim() || undefined,
    page: parsePositiveInt(searchParams.get("page"), 1, 10_000),
    limit: parsePositiveInt(searchParams.get("limit"), 50, 200),
  };
}

export function buildAuditLogWhere(params: AuditLogQueryParams): Prisma.AdminAuditLogWhereInput {
  const createdAt: Prisma.DateTimeFilter = {};
  const fromDate = parseDate(params.from ?? null);
  const toDate = parseDate(params.to ?? null, { endOfDay: true });

  if (fromDate) createdAt.gte = fromDate;
  if (toDate) createdAt.lte = toDate;

  return {
    ...(params.actorRole ? { actorRole: params.actorRole } : {}),
    ...(params.action ? { action: { contains: params.action, mode: "insensitive" } } : {}),
    ...(params.resource ? { resource: { contains: params.resource, mode: "insensitive" } } : {}),
    ...(fromDate || toDate ? { createdAt } : {}),
  };
}

export function normalizeAuditLogLimit(limit: number, max = 200) {
  return Math.min(Math.max(1, limit), max);
}
