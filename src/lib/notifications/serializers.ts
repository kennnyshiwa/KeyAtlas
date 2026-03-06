import type { Notification } from "@/generated/prisma/client";

export function toNotificationPayload(notification: Notification) {
  return {
    id: notification.id,
    type: notification.type,
    title: notification.title,
    message: notification.message,
    link: notification.link,
    createdAt: notification.createdAt,
    readAt: notification.readAt,
    ...(notification.metadata ? { metadata: notification.metadata } : {}),
  };
}
