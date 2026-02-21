import type { NotificationPreference, NotificationPreferenceType } from "@/generated/prisma/client";

export const NOTIFICATION_PREFERENCE_TYPES: NotificationPreferenceType[] = [
  "FORUM_REPLIES",
  "FORUM_CATEGORY_THREADS",
  "PROJECT_UPDATES",
  "PROJECT_COMMENTS",
  "NEW_FOLLOWERS",
];

export const DEFAULT_NOTIFICATION_PREFERENCES: Record<
  NotificationPreferenceType,
  { inApp: boolean; email: boolean }
> = {
  FORUM_REPLIES: { inApp: true, email: false },
  FORUM_CATEGORY_THREADS: { inApp: true, email: false },
  PROJECT_UPDATES: { inApp: true, email: false },
  PROJECT_COMMENTS: { inApp: true, email: false },
  NEW_FOLLOWERS: { inApp: true, email: false },
};

export function buildNotificationPreferencesView(stored: NotificationPreference[]) {
  const byType = new Map(stored.map((p) => [p.type, p]));

  return NOTIFICATION_PREFERENCE_TYPES.map((type) => ({
    type,
    inApp: byType.get(type)?.inApp ?? DEFAULT_NOTIFICATION_PREFERENCES[type].inApp,
    email: byType.get(type)?.email ?? DEFAULT_NOTIFICATION_PREFERENCES[type].email,
  }));
}

export function buildNotificationPreferenceWrite(
  type: NotificationPreferenceType,
  inApp: boolean | undefined,
  email: boolean | undefined,
) {
  const defaultPref = DEFAULT_NOTIFICATION_PREFERENCES[type];

  return {
    create: {
      type,
      inApp: inApp ?? defaultPref.inApp,
      email: email ?? defaultPref.email,
    },
    update: {
      ...(typeof inApp === "boolean" ? { inApp } : {}),
      ...(typeof email === "boolean" ? { email } : {}),
    },
  };
}
