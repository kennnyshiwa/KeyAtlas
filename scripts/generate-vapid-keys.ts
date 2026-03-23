#!/usr/bin/env tsx
/**
 * Generate VAPID keys for Web Push Notifications.
 * Run: npx tsx scripts/generate-vapid-keys.ts
 *
 * Add the output to your .env file.
 */
import webpush from "web-push";

const vapidKeys = webpush.generateVAPIDKeys();

console.log("VAPID keys generated successfully!\n");
console.log("Add the following to your .env file:\n");
console.log(`VAPID_PUBLIC_KEY="${vapidKeys.publicKey}"`);
console.log(`VAPID_PRIVATE_KEY="${vapidKeys.privateKey}"`);
console.log(`VAPID_SUBJECT="mailto:admin@yourdomain.com"`);
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY="${vapidKeys.publicKey}"`);
