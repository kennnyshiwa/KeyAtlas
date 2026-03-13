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

/**
 * Treat date-only gbEndDate values as end-of-day UTC (23:59:59.999).
 * A GB ending "March 13" should remain open through all of March 13 UTC.
 */
function effectiveEndDate(d: Date): Date {
  const h = d.getUTCHours() + d.getUTCMinutes() + d.getUTCSeconds();
  if (h === 0) {
    // Stored as midnight — treat as end of that day
    const eod = new Date(d);
    eod.setUTCHours(23, 59, 59, 999);
    return eod;
  }
  return d;
}

function formatTimeRemaining(ms: number): string {
  const hours = Math.round(ms / (60 * 60 * 1000));
  if (hours < 1) return "less than an hour";
  if (hours < 24) return hours === 1 ? "1 hour" : `${hours} hours`;
  const days = Math.round(hours / 24);
  return days === 1 ? "1 day" : `${days} days`;
}

export async function runGbEndingSoonNotifications(now = new Date()): Promise<GbEndingSoonJobResult> {
  const in72h = new Date(now.getTime() + 72 * 60 * 60 * 1000);
  const { start: dayStart, end: dayEnd } = utcDayBounds(now);

  // Find projects whose effective end date is within the next 72 hours.
  // We query with a wider window since midnight dates need adjustment.
  const projects = await prisma.project.findMany({
    where: {
      published: true,
      gbEndDate: {
        gte: new Date(now.getTime() - 24 * 60 * 60 * 1000), // include today's midnight dates
        lte: in72h,
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

    const endDate = effectiveEndDate(project.gbEndDate);
    // Skip if already past effective end date
    if (endDate.getTime() <= now.getTime()) continue;

    const msRemaining = endDate.getTime() - now.getTime();
    const timeLabel = formatTimeRemaining(msRemaining);

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
      message: `${project.title} group buy closes in ${timeLabel}.`,
      link: `/projects/${project.slug}`,
      metadata: {
        projectId: project.id,
        projectSlug: project.slug,
        gbEndDate: endDate.toISOString(),
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
