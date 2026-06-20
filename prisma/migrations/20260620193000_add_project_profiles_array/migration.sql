ALTER TABLE "projects"
ADD COLUMN "profiles" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "projects"
SET "profiles" = ARRAY["profile"]
WHERE "profile" IS NOT NULL AND "profile" <> '';

CREATE INDEX "projects_profiles_idx" ON "projects" USING GIN ("profiles");
