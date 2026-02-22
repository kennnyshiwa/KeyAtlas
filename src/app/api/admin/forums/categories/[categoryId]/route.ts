import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isAdmin, requireAdminSession } from "@/lib/admin-auth";

const patchSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  slug: z.string().trim().min(2).max(80).regex(/^[a-z0-9-]+$/).optional(),
  description: z.string().trim().max(240).nullable().optional(),
  order: z.number().int().min(0).max(9999).optional(),
  archived: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ categoryId: string }> }) {
  const access = await requireAdminSession({ allowModeratorReadOnly: true });
  if (!access.ok) {
    return NextResponse.json({ error: access.error, message: access.message }, { status: access.status });
  }
  if (!isAdmin(access.session.user.role)) {
    return NextResponse.json({ error: "FORBIDDEN", message: "Admin role required" }, { status: 403 });
  }

  const { categoryId } = await params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 400 });
  }

  const current = await prisma.forumCategory.findUnique({ where: { id: categoryId }, select: { id: true, name: true } });
  if (!current) {
    return NextResponse.json({ error: "NOT_FOUND", message: "Category not found" }, { status: 404 });
  }

  const { archived, ...rest } = parsed.data;
  const data: Record<string, unknown> = { ...rest };

  if (typeof archived === "boolean") {
    if (archived) {
      data.order = 9999;
      if (!current.name.startsWith("[Archived] ")) {
        data.name = `[Archived] ${rest.name ?? current.name}`;
      }
    } else if (current.name.startsWith("[Archived] ")) {
      data.name = (rest.name ?? current.name).replace(/^\[Archived\]\s*/, "");
    }
  }

  const updated = await prisma.forumCategory.update({
    where: { id: categoryId },
    data,
    select: { id: true, name: true, slug: true, description: true, order: true },
  });

  return NextResponse.json({ data: updated });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ categoryId: string }> }) {
  const access = await requireAdminSession({ allowModeratorReadOnly: true });
  if (!access.ok) {
    return NextResponse.json({ error: access.error, message: access.message }, { status: access.status });
  }
  if (!isAdmin(access.session.user.role)) {
    return NextResponse.json({ error: "FORBIDDEN", message: "Admin role required" }, { status: 403 });
  }

  const { categoryId } = await params;

  const category = await prisma.forumCategory.findUnique({
    where: { id: categoryId },
    select: { id: true, _count: { select: { threads: true } } },
  });

  if (!category) {
    return NextResponse.json({ error: "NOT_FOUND", message: "Category not found" }, { status: 404 });
  }

  if (category._count.threads > 0) {
    return NextResponse.json(
      { error: "INVALID_ACTION", message: "Cannot delete category with threads. Archive it instead." },
      { status: 400 }
    );
  }

  await prisma.forumCategory.delete({ where: { id: categoryId } });
  return NextResponse.json({ data: { id: categoryId, deleted: true } });
}
