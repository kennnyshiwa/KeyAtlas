import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isAdmin, requireAdminSession } from "@/lib/admin-auth";

const transferSchema = z
  .object({
    targetUserId: z.string().trim().min(1).optional(),
    targetEmail: z.string().trim().email().optional(),
  })
  .refine((data) => Boolean(data.targetUserId || data.targetEmail), {
    message: "Provide targetUserId or targetEmail",
    path: ["targetUserId"],
  });

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const access = await requireAdminSession();
  if (!access.ok) {
    return NextResponse.json(
      { error: access.error, message: access.message },
      { status: access.status }
    );
  }

  if (!isAdmin(access.session.user.role)) {
    return NextResponse.json(
      { error: "FORBIDDEN", message: "Admin role required" },
      { status: 403 }
    );
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = transferSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "VALIDATION_ERROR",
        message: "Invalid payload",
        details: parsed.error.flatten(),
      },
      { status: 400 }
    );
  }

  const project = await prisma.project.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      creatorId: true,
      creator: {
        select: {
          id: true,
          name: true,
          email: true,
          displayName: true,
          username: true,
        },
      },
    },
  });

  if (!project) {
    return NextResponse.json(
      { error: "NOT_FOUND", message: "Project not found" },
      { status: 404 }
    );
  }

  const { targetUserId, targetEmail } = parsed.data;
  const targetUser = await prisma.user.findFirst({
    where: targetUserId
      ? { id: targetUserId }
      : {
          email: {
            equals: targetEmail!,
            mode: "insensitive",
          },
        },
    select: {
      id: true,
      name: true,
      email: true,
      displayName: true,
      username: true,
      image: true,
      role: true,
    },
  });

  if (!targetUser) {
    return NextResponse.json(
      { error: "NOT_FOUND", message: "Target user not found" },
      { status: 404 }
    );
  }

  if (targetUser.id === project.creatorId) {
    return NextResponse.json(
      { error: "NO_OP", message: "Project is already owned by that user" },
      { status: 409 }
    );
  }

  const updated = await prisma.project.update({
    where: { id: project.id },
    data: { creatorId: targetUser.id },
    select: {
      id: true,
      title: true,
      creatorId: true,
      creator: {
        select: {
          id: true,
          name: true,
          email: true,
          displayName: true,
          username: true,
          image: true,
          role: true,
        },
      },
      updatedAt: true,
    },
  });

  return NextResponse.json({
    success: true,
    project: updated,
    previousOwner: project.creator,
  });
}
