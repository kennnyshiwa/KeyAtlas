-- Read-only, one-statement consistent full row plus ordered full source evidence.
-- Save/review this JSON, do not recapture automatically at apply time.
-- Full to_jsonb includes live-only fields absent from Prisma. Missing row => null.
SELECT jsonb_build_object(
  'project', (SELECT to_jsonb(p) FROM projects p WHERE id = 'cmoum375i01l101phrdrudjk5'),
  'sources', (SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY l."sortOrder", l.id), '[]'::jsonb)
    FROM project_links l WHERE "projectId" = 'cmoum375i01l101phrdrudjk5')
) AS expected_snapshot;
