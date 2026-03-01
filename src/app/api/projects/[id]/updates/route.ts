import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { projectUpdateFormSchema } from "@/lib/validations/project-update";
import { dispatchNotification } from "@/lib/notifications/service";
import { rateLimit, RATE_LIMIT_PROJECT_UPDATE_CREATE } from "@/lib/rate-limit";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const updates = await prisma.projectUpdate.findMany({
    where: { projectId: id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(updates);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const limited = await rateLimit(session.user.id, "updates:create", RATE_LIMIT_PROJECT_UPDATE_CREATE);
  if (limited) return limited;

  const { id } = await params;

  // Only creator or admin can post updates
  const project = await prisma.project.findUnique({
    where: { id },
    select: { creatorId: true, title: true, slug: true },
  });

  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (
    project.creatorId !== session.user.id &&
    session.user.role !== "ADMIN"
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await req.json();
  const result = projectUpdateFormSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: result.error.issues },
      { status: 400 }
    );
  }

  const update = await prisma.projectUpdate.create({
    data: {
      ...result.data,
      projectId: id,
    },
  });

  const followers = await prisma.follow.findMany({
    where: { targetType: "PROJECT", targetId: id },
    select: { userId: true },
  });

  await dispatchNotification({
    recipients: followers.map((f) => f.userId),
    actorId: session.user.id,
    preferenceType: "PROJECT_UPDATES",
    notificationType: "PROJECT_UPDATE",
    title: "Project update posted",
    message: `${project.title} has a new update: ${update.title}`,
    link: `/projects/${project.slug}`,
    emailSubject: `Project update: ${project.title}`,
    emailHeading: `New update for ${project.title}`,
    emailCtaLabel: "View project",
  });

  return NextResponse.json(update, { status: 201 });
}
