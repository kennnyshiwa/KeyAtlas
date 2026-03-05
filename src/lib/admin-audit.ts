import { prisma } from "@/lib/prisma";
import type { UserRole } from "@/generated/prisma/client";

interface AuditInput {
  actorId: string;
  actorRole: UserRole;
  action: string;
  resource: string;
  resourceId?: string | null;
  targetId?: string | null;
  metadata?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export async function logAdminAction(input: AuditInput) {
  try {
    await prisma.adminAuditLog.create({
      data: {
        actorId: input.actorId,
        actorRole: input.actorRole,
        action: input.action,
        resource: input.resource,
        resourceId: input.resourceId ?? null,
        targetId: input.targetId ?? null,
        metadata: input.metadata as never,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      },
    });
  } catch (error) {
    console.error("[admin-audit] failed to write audit log", error);
  }
}
