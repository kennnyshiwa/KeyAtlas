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

export async function dispatchNotification(input: NotificationDispatchInput) {
  const recipientIds = Array.from(
    new Set(input.recipients.filter((id) => id && id !== input.actorId))
  );

  if (recipientIds.length === 0) return;

  const users = await prisma.user.findMany({
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

  for (const user of users) {
    const pref = user.notificationPreferences[0] ?? DEFAULT_NOTIFICATION_PREFERENCES[input.preferenceType];

    if (pref.inApp) {
      await prisma.notification.create({
        data: {
          userId: user.id,
          type: input.notificationType,
          title: input.title,
          message: input.message,
          link: input.link,
          metadata: input.metadata as Prisma.InputJsonValue | undefined,
        },
      });

      for (const device of user.pushDevices) {
        if (device.platform === "ios") {
          try {
            await sendAPNSNotification({
              token: device.token,
              title: input.title,
              body: input.message,
              link: input.link,
            });
          } catch (error) {
            console.error("Failed to send APNS push", error);
          }
        } else if (device.platform === "web") {
          await sendWebPushToDevice({
            deviceId: device.id,
            tokenJson: device.token,
            title: input.title,
            body: input.message,
            link: input.link,
          });
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
}
