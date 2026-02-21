import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { UserRole } from "@/generated/prisma/client";

const ADMIN_ONLY = new Set<UserRole>(["ADMIN"]);
const ADMIN_OR_MOD = new Set<UserRole>(["ADMIN", "MODERATOR"]);

export async function requireAdminSession(options?: { allowModeratorReadOnly?: boolean }) {
  const session = await auth();

  if (!session?.user) {
    return { ok: false as const, status: 401, error: "UNAUTHORIZED", message: "Authentication required" };
  }

  const roleSet = options?.allowModeratorReadOnly ? ADMIN_OR_MOD : ADMIN_ONLY;
  if (!roleSet.has(session.user.role)) {
    return { ok: false as const, status: 403, error: "FORBIDDEN", message: "Insufficient role" };
  }

  return { ok: true as const, session };
}

export function isAdmin(role: UserRole) {
  return role === "ADMIN";
}

export async function revokeAllUserSessions(userId: string) {
  await prisma.session.deleteMany({ where: { userId } });
}
