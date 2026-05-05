-- Remove deprecated SHIPPING, EXTRAS, and ARCHIVED statuses,
-- and drop the legacy shipped flag.
-- Existing data is migrated as follows:
--   EXTRAS   -> IN_STOCK
--   SHIPPING -> COMPLETED
--   ARCHIVED -> COMPLETED
-- Saved filters using shipped=true are rewritten to COMPLETED when they do not
-- already target a supported status, then the shipped key is removed.

ALTER TYPE "ProjectStatus" RENAME TO "ProjectStatus_old";

CREATE TYPE "ProjectStatus" AS ENUM (
  'INTEREST_CHECK',
  'GROUP_BUY',
  'PRODUCTION',
  'IN_STOCK',
  'COMPLETED'
);

ALTER TABLE "projects"
  ALTER COLUMN "status" DROP DEFAULT;

UPDATE "projects"
SET "status" = 'IN_STOCK'
WHERE "status" = 'EXTRAS';

UPDATE "projects"
SET "status" = 'COMPLETED'
WHERE "status" = 'SHIPPING';

UPDATE "projects"
SET "status" = 'COMPLETED'
WHERE "status" = 'ARCHIVED';

UPDATE "saved_filters"
SET "criteria" = jsonb_set("criteria", '{status}', to_jsonb('IN_STOCK'::text), false)
WHERE "criteria"->>'status' = 'EXTRAS';

UPDATE "saved_filters"
SET "criteria" = jsonb_set("criteria", '{status}', to_jsonb('COMPLETED'::text), false)
WHERE "criteria"->>'status' = 'SHIPPING';

UPDATE "saved_filters"
SET "criteria" = jsonb_set("criteria", '{status}', to_jsonb('COMPLETED'::text), false)
WHERE "criteria"->>'status' = 'ARCHIVED';

UPDATE "saved_filters"
SET "criteria" = jsonb_set("criteria" - 'shipped', '{status}', to_jsonb('COMPLETED'::text), true)
WHERE "criteria"->>'shipped' = 'true'
  AND COALESCE("criteria"->>'status', '') NOT IN (
    'INTEREST_CHECK',
    'GROUP_BUY',
    'PRODUCTION',
    'IN_STOCK',
    'COMPLETED'
  );

UPDATE "saved_filters"
SET "criteria" = "criteria" - 'shipped'
WHERE "criteria" ? 'shipped';

ALTER TABLE "projects"
  ALTER COLUMN "status" TYPE "ProjectStatus"
  USING ("status"::text::"ProjectStatus");

DROP INDEX IF EXISTS "projects_shipped_idx";

ALTER TABLE "projects"
  DROP COLUMN IF EXISTS "shipped";

ALTER TABLE "projects"
  ALTER COLUMN "status" SET DEFAULT 'INTEREST_CHECK';

DROP TYPE "ProjectStatus_old";
