import webpush from "web-push";
import type { PushSubscription } from "web-push";
import { prisma } from "@/lib/prisma";

let vapidConfigured = false;

function ensureVapidConfig() {
  if (vapidConfigured) return;

  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;

  if (!publicKey || !privateKey || !subject) {
    throw new Error(
      "VAPID keys not configured. Set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_SUBJECT in your environment."
    );
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
}

export interface WebPushParams {
  subscription: PushSubscription;
  title: string;
  body: string;
  link?: string;
  icon?: string;
}

export async function sendWebPushNotification(params: WebPushParams): Promise<void> {
  ensureVapidConfig();

  const payload = JSON.stringify({
    title: params.title,
    body: params.body,
    link: params.link ?? "/notifications",
    icon: params.icon ?? "/icons/icon-192x192.png",
  });

  await webpush.sendNotification(params.subscription, payload);
}

/**
 * Send web push to a device token (stored as JSON string in DB).
 * Handles 410 (expired/invalid) by deleting the device record.
 */
export async function sendWebPushToDevice(params: {
  deviceId: string;
  tokenJson: string;
  title: string;
  body: string;
  link?: string;
  icon?: string;
}): Promise<void> {
  let subscription: PushSubscription;
  try {
    subscription = JSON.parse(params.tokenJson) as PushSubscription;
  } catch {
    console.error("Web push: failed to parse subscription JSON for device", params.deviceId);
    return;
  }

  try {
    await sendWebPushNotification({
      subscription,
      title: params.title,
      body: params.body,
      link: params.link,
      icon: params.icon,
    });
  } catch (err: unknown) {
    const statusCode =
      err instanceof webpush.WebPushError ? err.statusCode : null;

    if (statusCode === 410 || statusCode === 404) {
      // Subscription expired or invalid — remove from DB
      console.info("Web push: removing expired subscription for device", params.deviceId);
      await prisma.pushDevice.delete({ where: { id: params.deviceId } }).catch((deleteErr) => {
        console.error("Web push: failed to delete expired device", deleteErr);
      });
    } else {
      console.error("Web push: send failed for device", params.deviceId, err);
    }
  }
}
