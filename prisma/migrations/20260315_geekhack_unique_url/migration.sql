-- Prevent duplicate Geekhack topic imports
-- This partial unique index ensures each Geekhack URL can only be linked to one project
CREATE UNIQUE INDEX IF NOT EXISTS "idx_project_links_geekhack_url" ON "project_links" ("url") WHERE "type" = 'GEEKHACK';
