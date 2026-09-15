import type { NotificationPreferenceType, NotificationType, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "@/lib/notifications/preferences";
import { getSiteUrl } from "@/lib/site";
import { sendNotificationEmail } from "@/lib/notifications/email";
import { sendAPNSNotification } from "@/lib/notifications/apns";
import { sendWebPushToDevice } from "@/lib/notifications/web-push";

interface NotificationDispatchInput {
  recipients: string[];
  actorId?: string;
  preferenceType: NotificationPreferenceType;
  notificationType: NotificationType;
  title: string;
  message: string;
  link?: string;
  metadata?: Record<string, unknown>;
  emailSubject?: string;
  emailHeading?: string;
  emailCtaLabel?: string;
}

async function notificationUsers(input: NotificationDispatchInput, db: Prisma.TransactionClient) {
  const recipientIds = Array.from(
    new Set(input.recipients.filter((id) => id && id !== input.actorId))
  );

  if (recipientIds.length === 0) return [];

  return db.user.findMany({
    where: { id: { in: recipientIds } },
    select: {
      id: true,
      email: true,
      name: true,
      displayName: true,
      notificationPreferences: {
        where: { type: input.preferenceType },
        select: { inApp: true, email: true },
        take: 1,
      },
      pushDevices: {
        where: { enabled: true },
        select: { id: true, platform: true, token: true },
      },
    },
  });
}

type NotificationUser = Awaited<ReturnType<typeof notificationUsers>>[number];

async function persistNotification(input: NotificationDispatchInput, user: NotificationUser, db: Prisma.TransactionClient) {
  const pref = user.notificationPreferences[0] ?? DEFAULT_NOTIFICATION_PREFERENCES[input.preferenceType];
  if (pref.inApp) {
    await db.notification.create({ data: {
      userId: user.id, type: input.notificationType, title: input.title,
      message: input.message, link: input.link,
      metadata: input.metadata as Prisma.InputJsonValue | undefined,
    } });
  }
}

async function deliverNotification(input: NotificationDispatchInput, user: NotificationUser) {
  const pref = user.notificationPreferences[0] ?? DEFAULT_NOTIFICATION_PREFERENCES[input.preferenceType];
  if (pref.inApp) {
    for (const device of user.pushDevices) {
      if (device.platform === "ios") {
        try {
          await sendAPNSNotification({ token: device.token, title: input.title, body: input.message, link: input.link });
        } catch (error) {
          console.error("Failed to send APNS push", error);
        }
      } else if (device.platform === "web") {
        await sendWebPushToDevice({ deviceId: device.id, tokenJson: device.token, title: input.title, body: input.message, link: input.link });
      }
    }
  }
  if (pref.email && user.email) {
    try {
      const appUrl = getSiteUrl().replace(/\/$/, "");
      const ctaUrl = input.link?.startsWith("http") ? input.link : `${appUrl}${input.link || "/notifications"}`;
      await sendNotificationEmail({
        to: user.email,
        subject: input.emailSubject || input.title,
        heading: input.emailHeading || input.title,
        body: input.message,
        ctaLabel: input.emailCtaLabel || "View notification",
        ctaUrl,
      });
    } catch (error) {
      console.error("Failed to send notification email", error);
    }
  }
}

// Existing callers retain their per-recipient persistence/delivery behavior.
export async function dispatchNotification(input: NotificationDispatchInput) {
  for (const user of await notificationUsers(input, prisma)) {
    await persistNotification(input, user, prisma);
    await deliverNotification(input, user);
  }
}

/** Stage in-app rows in the content transaction. Invoke returned delivery ONLY after commit.
 * Rollback discards the event; delivery failure never turns committed content into an HTTP error.
 * External transports remain best-effort, not a durable exactly-once delivery system.
 */
export async function stageNotification(input: NotificationDispatchInput, tx: Prisma.TransactionClient) {
  const users = await notificationUsers(input, tx);
  for (const user of users) await persistNotification(input, user, tx);
  let delivered = false;
  return async () => {
    if (delivered) return;
    delivered = true;
    for (const user of users) {
      try { await deliverNotification(input, user); }
      catch (error) { console.error("Failed to deliver committed notification", error); }
    }
  };
}
