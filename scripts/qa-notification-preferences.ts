#!/usr/bin/env npx tsx
import assert from "node:assert/strict";
import {
  buildNotificationPreferenceWrite,
  buildNotificationPreferencesView,
  NOTIFICATION_PREFERENCE_TYPES,
} from "@/lib/notifications/preferences";

function main() {
  const view = buildNotificationPreferencesView([
    {
      id: "pref-1",
      userId: "user-1",
      type: "NEW_FOLLOWERS",
      inApp: false,
      email: true,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    },
  ] as never);

  assert.equal(view.length, NOTIFICATION_PREFERENCE_TYPES.length, "GET view should include all preference types");
  assert.deepEqual(
    view.find((p) => p.type === "NEW_FOLLOWERS"),
    { type: "NEW_FOLLOWERS", inApp: false, email: true },
    "stored preference should override defaults",
  );
  assert.equal(
    view.find((p) => p.type === "PROJECT_UPDATES")?.inApp,
    true,
    "missing preference should fallback to default values",
  );

  const write = buildNotificationPreferenceWrite("PROJECT_COMMENTS", undefined, true);
  assert.deepEqual(
    write.create,
    { type: "PROJECT_COMMENTS", inApp: true, email: true },
    "PATCH create payload should apply defaults for missing fields",
  );
  assert.deepEqual(write.update, { email: true }, "PATCH update payload should include only provided fields");

  console.log("PASS qa-notification-preferences");
}

try {
  main();
} catch (error) {
  console.error("FAIL qa-notification-preferences");
  console.error(error);
  process.exit(1);
}
