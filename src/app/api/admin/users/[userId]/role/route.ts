import { NextResponse } from "next/server";
import { z } from "zod";
import { UserRole } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { isAdmin, requireAdminSession } from "@/lib/admin-auth";

const bodySchema = z.object({
  role: z.enum(["USER", "MODERATOR", "ADMIN"]),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const access = await requireAdminSession();
  if (!access.ok) {
    return NextResponse.json({ error: access.error, message: access.message }, { status: access.status });
  }

  if (!isAdmin(access.session.user.role)) {
    return NextResponse.json({ error: "FORBIDDEN", message: "Admin role required" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", message: "Invalid body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { userId } = await params;
  if (userId === access.session.user.id && parsed.data.role !== UserRole.ADMIN) {
    return NextResponse.json(
      { error: "INVALID_ACTION", message: "Cannot remove your own admin role" },
      { status: 400 }
    );
  }

  const existing = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!existing) {
    return NextResponse.json({ error: "NOT_FOUND", message: "User not found" }, { status: 404 });
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { role: parsed.data.role },
    select: { id: true, role: true },
  });

  return NextResponse.json({ data: updated });
}
