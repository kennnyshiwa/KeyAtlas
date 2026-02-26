import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const savedFilterSchema = z.object({
  name: z.string().min(1).max(100),
  criteria: z.object({
    status: z.string().optional(),
    category: z.string().optional(),   // comma-separated
    profile: z.string().optional(),    // comma-separated
    designer: z.string().optional(),
    vendor: z.string().optional(),     // comma-separated vendor IDs
    shipped: z.boolean().optional(),
    q: z.string().optional(),
  }),
  notify: z.boolean().default(true),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const filters = await prisma.savedFilter.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ filters });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  // Max 20 saved filters per user
  const count = await prisma.savedFilter.count({ where: { userId: session.user.id } });
  if (count >= 20) {
    return NextResponse.json(
      { error: "Maximum of 20 saved filters reached." },
      { status: 400 }
    );
  }

  const body = await req.json();
  const result = savedFilterSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: result.error.issues },
      { status: 400 }
    );
  }

  const filter = await prisma.savedFilter.create({
    data: {
      name: result.data.name,
      criteria: result.data.criteria,
      notify: result.data.notify,
      userId: session.user.id,
    },
  });

  return NextResponse.json(filter, { status: 201 });
}
