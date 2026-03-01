-- AlterTable: convert estimatedDelivery from timestamp to text
-- First add a temp column, copy formatted data, drop old, rename
ALTER TABLE "projects" ADD COLUMN "estimatedDelivery_new" TEXT;

UPDATE "projects"
SET "estimatedDelivery_new" = CASE
  WHEN "estimatedDelivery" IS NOT NULL
  THEN 'Q' || CEIL(EXTRACT(MONTH FROM "estimatedDelivery")::numeric / 3)::text || ' ' || EXTRACT(YEAR FROM "estimatedDelivery")::text
  ELSE NULL
END;

ALTER TABLE "projects" DROP COLUMN "estimatedDelivery";
ALTER TABLE "projects" RENAME COLUMN "estimatedDelivery_new" TO "estimatedDelivery";
