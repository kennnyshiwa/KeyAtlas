import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isAdmin, requireAdminSession } from "@/lib/admin-auth";

const schema = z.object({
  name: z.string().trim().min(2).max(80),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9-]+$/),
  description: z.string().trim().max(240).optional().nullable(),
});

export async function POST(req: Request) {
  const access = await requireAdminSession({ allowModeratorReadOnly: true });
  if (!access.ok) {
    return NextResponse.json({ error: access.error, message: access.message }, { status: access.status });
  }

  if (!isAdmin(access.session.user.role)) {
    return NextResponse.json({ error: "FORBIDDEN", message: "Admin role required" }, { status: 403 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", message: "Invalid body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { name, slug, description } = parsed.data;

  const existing = await prisma.forumCategory.findUnique({ where: { slug }, select: { id: true } });
  if (existing) {
    return NextResponse.json({ error: "CONFLICT", message: "Category slug already exists" }, { status: 409 });
  }

  const maxOrder = await prisma.forumCategory.aggregate({ _max: { order: true } });

  const category = await prisma.forumCategory.create({
    data: {
      name,
      slug,
      description: description || null,
      order: (maxOrder._max.order ?? 0) + 1,
    },
    select: { id: true, name: true, slug: true, description: true, order: true },
  });

  return NextResponse.json({ data: category }, { status: 201 });
}
