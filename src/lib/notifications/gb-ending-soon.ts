import { prisma } from "@/lib/prisma";
import { dispatchNotification } from "@/lib/notifications/service";

export interface GbEndingSoonJobResult {
  scannedProjects: number;
  notificationsCreated: number;
}

function utcDayBounds(date = new Date()) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

export async function runGbEndingSoonNotifications(now = new Date()): Promise<GbEndingSoonJobResult> {
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const { start: dayStart, end: dayEnd } = utcDayBounds(now);

  const projects = await prisma.project.findMany({
    where: {
      published: true,
      gbEndDate: {
        gte: now,
        lte: in24h,
      },
    },
    select: {
      id: true,
      title: true,
      slug: true,
      gbEndDate: true,
      followers: {
        where: { targetType: "PROJECT" },
        select: { userId: true },
      },
    },
  });

  let notificationsCreated = 0;

  for (const project of projects) {
    if (!project.gbEndDate || project.followers.length === 0) continue;

    const followerIds = Array.from(new Set(project.followers.map((f) => f.userId)));

    const alreadyNotified = await prisma.notification.findMany({
      where: {
        type: "PROJECT_GB_ENDING_SOON",
        userId: { in: followerIds },
        createdAt: { gte: dayStart, lt: dayEnd },
        metadata: {
          path: ["projectId"],
          equals: project.id,
        },
      },
      select: { userId: true },
    });

    const alreadySet = new Set(alreadyNotified.map((n) => n.userId));
    const recipients = followerIds.filter((id) => !alreadySet.has(id));
    if (recipients.length === 0) continue;

    await dispatchNotification({
      recipients,
      preferenceType: "PROJECT_GB_ENDING_SOON",
      notificationType: "PROJECT_GB_ENDING_SOON",
      title: `${project.title} ends soon`,
      message: `${project.title} group buy closes within 24 hours.`,
      link: `/projects/${project.slug}`,
      metadata: {
        projectId: project.id,
        projectSlug: project.slug,
        gbEndDate: project.gbEndDate.toISOString(),
      },
      emailSubject: `${project.title} group buy ends soon`,
      emailHeading: "Group buy ending soon",
      emailCtaLabel: "View project",
    });

    notificationsCreated += recipients.length;
  }

  return {
    scannedProjects: projects.length,
    notificationsCreated,
  };
}
