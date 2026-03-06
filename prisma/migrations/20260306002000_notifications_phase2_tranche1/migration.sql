-- Add lifecycle notification type and stable payload fields
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PROJECT_GB_ENDING_SOON';

ALTER TYPE "NotificationPreferenceType" ADD VALUE IF NOT EXISTS 'PROJECT_STATUS_CHANGES';
ALTER TYPE "NotificationPreferenceType" ADD VALUE IF NOT EXISTS 'PROJECT_GB_ENDING_SOON';

ALTER TABLE "notifications"
  ADD COLUMN IF NOT EXISTS "readAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "metadata" JSONB;

-- Backfill readAt for historical read notifications
UPDATE "notifications"
SET "readAt" = COALESCE("readAt", "createdAt")
WHERE "read" = true
  AND "readAt" IS NULL;
