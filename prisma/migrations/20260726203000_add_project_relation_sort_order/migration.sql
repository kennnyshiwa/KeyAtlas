ALTER TABLE "project_links"
ADD COLUMN "sortOrder" INTEGER;

WITH ranked_links AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (PARTITION BY "projectId" ORDER BY ctid) - 1 AS sort_order
  FROM "project_links"
)
UPDATE "project_links" AS pl
SET "sortOrder" = ranked_links.sort_order
FROM ranked_links
WHERE ranked_links."id" = pl."id";

ALTER TABLE "project_links"
ALTER COLUMN "sortOrder" SET NOT NULL,
ALTER COLUMN "sortOrder" SET DEFAULT 0;

CREATE INDEX "project_links_projectId_sortOrder_idx" ON "project_links"("projectId", "sortOrder");

ALTER TABLE "project_vendors"
ADD COLUMN "sortOrder" INTEGER;

WITH ranked_vendors AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "projectId"
      ORDER BY "createdAt" ASC, "id" ASC
    ) - 1 AS sort_order
  FROM "project_vendors"
)
UPDATE "project_vendors" AS pv
SET "sortOrder" = ranked_vendors.sort_order
FROM ranked_vendors
WHERE ranked_vendors."id" = pv."id";

ALTER TABLE "project_vendors"
ALTER COLUMN "sortOrder" SET NOT NULL,
ALTER COLUMN "sortOrder" SET DEFAULT 0;

CREATE INDEX "project_vendors_projectId_sortOrder_idx" ON "project_vendors"("projectId", "sortOrder");
