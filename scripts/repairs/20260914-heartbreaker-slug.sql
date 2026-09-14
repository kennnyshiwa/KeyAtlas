-- DRY RUN by default. Supply a freshly reviewed JSON snapshot on this SAME
-- dedicated connection via set_config('keyatlas.heartbreaker_expected', ..., false).
-- See the runbook and snapshot SQL. Missing/stale evidence fails closed.
-- Ops may replace ONLY final ROLLBACK with COMMIT in a reviewed copy.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15s';
-- Both directions take locks in this order. Exclude source UPDATE/INSERT/DELETE
-- as well as project writes/collision inserts until transaction completion.
LOCK TABLE projects IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE project_links IN SHARE ROW EXCLUSIVE MODE;

-- Capture full child rows (identities AND content), including live FK children.
-- No persistent function or schema changes. Unknown composite FKs fail closed.
CREATE OR REPLACE FUNCTION pg_temp.heartbreaker_relations() RETURNS jsonb
LANGUAGE plpgsql AS $relations$
DECLARE
  fk record;
  rows_json jsonb;
  receipt jsonb := '{}'::jsonb;
BEGIN
  FOR fk IN
    SELECT c.conrelid::regclass AS relation, c.conname, a.attname,
           cardinality(c.conkey) AS key_count, pa.attname AS parent_column
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    JOIN pg_attribute pa ON pa.attrelid = c.confrelid AND pa.attnum = c.confkey[1]
    WHERE c.contype = 'f' AND c.confrelid = 'projects'::regclass
    ORDER BY c.conrelid::regclass::text, c.conname
  LOOP
    IF fk.key_count <> 1 OR fk.parent_column <> 'id' THEN
      RAISE EXCEPTION 'Unreviewed project FK shape; abort and re-review';
    END IF;
    EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text), ''[]''::jsonb) FROM %s r WHERE %I = $1', fk.relation, fk.attname)
      INTO rows_json USING 'cmoum375i01l101phrdrudjk5';
    receipt := receipt || jsonb_build_object(fk.relation::text || ':' || fk.conname, rows_json);
  END LOOP;
  SELECT coalesce(jsonb_agg(to_jsonb(f) ORDER BY f.id), '[]'::jsonb) INTO rows_json
    FROM follows f WHERE "targetType" = 'PROJECT' AND "targetId" = 'cmoum375i01l101phrdrudjk5';
  receipt := receipt || jsonb_build_object('legacy_follows', rows_json);
  SELECT coalesce(jsonb_agg(to_jsonb(w) ORDER BY w.id), '[]'::jsonb) INTO rows_json
    FROM watchlist_notifications w WHERE "projectId" = 'cmoum375i01l101phrdrudjk5';
  RETURN receipt || jsonb_build_object('watchlist_notifications', rows_json);
END $relations$;

CREATE TEMP TABLE heartbreaker_receipt (receipt jsonb NOT NULL) ON COMMIT DROP;
DO $repair$
DECLARE
  expected jsonb := nullif(current_setting('keyatlas.heartbreaker_expected', true), '')::jsonb;
  before_row jsonb;
  after_row jsonb;
  sources_before jsonb;
  sources_after jsonb;
  relations_before jsonb;
  relations_after jsonb;
  affected bigint;
BEGIN
  IF expected IS NULL OR jsonb_typeof(expected->'project') IS DISTINCT FROM 'object'
     OR jsonb_typeof(expected->'sources') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Fresh expected project/source snapshot required';
  END IF;
  SELECT to_jsonb(p) INTO before_row FROM projects p WHERE id = 'cmoum375i01l101phrdrudjk5';
  SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY l."sortOrder", l.id), '[]'::jsonb)
    INTO sources_before FROM project_links l WHERE "projectId" = 'cmoum375i01l101phrdrudjk5';
  IF before_row IS DISTINCT FROM expected->'project'
     OR sources_before IS DISTINCT FROM expected->'sources' THEN
    RAISE EXCEPTION 'Project/source snapshot changed; abort and re-review';
  END IF;
  IF before_row->>'slug' IS DISTINCT FROM 'notion-where-teams-and-agents-work-together'
     OR before_row->>'title' IS DISTINCT FROM 'SWG Heartbreaker | 20 July - 3 Aug 2026'
     OR before_row->>'status' IS DISTINCT FROM 'PRODUCTION'
     OR before_row->'published' IS DISTINCT FROM 'true'::jsonb THEN
    RAISE EXCEPTION 'Heartbreaker forward precondition changed; abort and re-review';
  END IF;
  IF EXISTS (SELECT 1 FROM projects WHERE slug = 'swg-heartbreaker-20-july-3-aug-2026') THEN
    RAISE EXCEPTION 'Desired slug collides (including unpublished projects)';
  END IF;
  relations_before := pg_temp.heartbreaker_relations();
  -- Only slug changes: even updatedAt and live-only columns are preserved.
  UPDATE projects p SET slug = 'swg-heartbreaker-20-july-3-aug-2026'
    WHERE id = 'cmoum375i01l101phrdrudjk5' AND slug = 'notion-where-teams-and-agents-work-together'
    RETURNING to_jsonb(p) INTO after_row;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'Expected exactly one affected row, got %', affected; END IF;
  -- Re-read after triggers too; RETURNING is the one-row mutation receipt.
  IF after_row IS DISTINCT FROM (SELECT to_jsonb(p) FROM projects p WHERE id = 'cmoum375i01l101phrdrudjk5')
     OR (after_row - 'slug') IS DISTINCT FROM (before_row - 'slug')
     OR after_row->>'slug' IS DISTINCT FROM 'swg-heartbreaker-20-july-3-aug-2026' THEN
    RAISE EXCEPTION 'Slug-only invariant failed';
  END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY l."sortOrder", l.id), '[]'::jsonb)
    INTO sources_after FROM project_links l WHERE "projectId" = 'cmoum375i01l101phrdrudjk5';
  relations_after := pg_temp.heartbreaker_relations();
  IF sources_after IS DISTINCT FROM sources_before OR relations_after IS DISTINCT FROM relations_before THEN
    RAISE EXCEPTION 'Relation/source preservation failed; abort and re-review';
  END IF;
  INSERT INTO heartbreaker_receipt VALUES (jsonb_build_object(
    'direction', 'forward', 'affected_rows', affected,
    'before', expected, 'after', jsonb_build_object('project', after_row, 'sources', sources_after),
    'relations_before', relations_before, 'relations_after', relations_after));
END $repair$;
SELECT receipt FROM heartbreaker_receipt;
ROLLBACK;
