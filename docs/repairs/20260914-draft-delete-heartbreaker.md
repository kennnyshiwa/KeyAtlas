# Draft DELETE and Heartbreaker legacy URL repair

## Scope and delivery order

Base: `8bdc78fb71cd2b31f03129cc849a114250acbf2f` (prior document-title fix retained).
No iOS code change and no schema migration. Parent owns independent QA, CI,
production schema inspection, deployment, exact-record repair and final acceptance.

1. **Before deploying aliases**, inspect the live PostgreSQL schema and query BOTH
   reserved slugs across **all projects, including unpublished**. The old name must
   belong to `cmoum375i01l101phrdrudjk5`; the new name must be unoccupied (or already
   belong to that ID during a reviewed resumed rollout). Public 404 is not sufficient.
2. Independently QA the scoped change and resolve/accept repository check blockers.
3. Deploy alias-capable app code before any data write. Verify old API/page still
   resolve the same published record. Both names resolve by immutable ID; page
   renders the same record and canonical metadata follows its current slug.
4. Snapshot the full exact project row and related media, links, vendors, comments,
   updates, favorites, collections, follows, reports, referral clicks, change logs,
   watchlist entries and the existing search document. Record current deployment SHA.
5. Capture a **fresh full PostgreSQL row and ordered full source rows** with
   `scripts/repairs/20260914-heartbreaker-snapshot.sql`. Save the JSON, capture time,
   database/deployment identity and SHA-256 with the reviewed source evidence.
   Review the actual source URLs/title as well as the row; a hash alone is not source
   approval. `to_jsonb` includes live-only columns (including `estimatedDelivery_new`)
   and exact timestamp precision, unlike a Prisma-selected field list. Keep the
   broader relation/search snapshot from step 4 too. Never hardcode an old preflight
   timestamp/hash or silently recapture expected evidence during apply.
6. Supply that reviewed JSON as `keyatlas.heartbreaker_expected` on a **dedicated
   connection**, then run `scripts/repairs/20260914-heartbreaker-slug.sql` with
   `psql -X -v ON_ERROR_STOP=1`. See the driver below. It defaults to **ROLLBACK**.
   Both directions lock `projects`, then `project_links`, in that order, for the
   whole transaction (5s lock / 15s statement timeout). Inserts/updates/deletes to
   either table, including source edits and unpublished collisions, are excluded.
   A writer that wins first is detected by the full-row/ordered-source comparison;
   lock timeout/deadlock, missing evidence or any mismatch requires stop/re-review,
   never blind retry. Existing editors may briefly block; use a serialized window.
   Inspect the one-row receipt and preservation checks, then Ops may replace only
   the final `ROLLBACK;` with `COMMIT;` in a reviewed copy. The SQL changes **only
   slug**, explicitly checks affected count = 1, full row minus slug, source rows,
   all catalog-discovered direct project FK child rows and non-FK follows/watchlist
   before/after. Save the complete receipt **and successful COMMIT result**, re-read
   the snapshot and compare it with receipt `after`. A dry-run receipt is not proof
   of a committed change. No bulk repair is authorized.
7. Reindex only this project using `npx tsx scripts/repairs/reindex-heartbreaker.ts`
   (dry run), then `--apply`. The helper waits for Meilisearch task success and
   verifies the stored slug; errors are not swallowed. Recheck DB slug if an operator
   is concurrently editing; do not run repair/rollback/reindex concurrently.
8. Verify old/new v1 GET returns the same id and new canonical slug, the old browser
   URL still renders Heartbreaker, both page canonicals use the new slug, and document
   title contains KeyAtlas only once. Compare full snapshots and social counts.
   These are durable content aliases (HTTP 200), not redirects. Both render the
   same record with its database canonical slug. Local Chromium confirmed that
   the previous streamed redirect path navigated incorrectly to the homepage;
   the exact aliases therefore do not depend on it. Other existing slug redirects
   are unchanged. No cached redirect loops can be introduced by rollback.
9. Complete the **required authorized production disposable-draft API lifecycle**
   below in the later Ops phase. Nonexistent-slug probes alone are not acceptance.

### Supplying reviewed SQL evidence

Capture against the intended database, redirecting to the release's protected
snapshot artifact, then review it before use:

```sh
psql -X -A -t -v ON_ERROR_STOP=1 -f scripts/repairs/20260914-heartbreaker-snapshot.sql > "$REVIEWED_SNAPSHOT"
```
A reviewed psql driver runs these statements on the same connection:

```sql
-- expected_snapshot is a psql variable containing the saved reviewed JSON.
-- psql :'variable' quotes JSON as a SQL literal; do not interpolate raw SQL text.
SELECT set_config('keyatlas.heartbreaker_expected', :'expected_snapshot', false);
\ir /absolute/path/to/reviewed-forward-or-rollback.sql
```

Pass the saved JSON using the exact reviewed snapshot/driver paths:

```sh
psql -X -v ON_ERROR_STOP=1 -v expected_snapshot="$(cat "$REVIEWED_SNAPSHOT")" -f "$REVIEWED_DRIVER"
```

Resolve the two paths to the exact reviewed artifacts. The
scripts themselves contain no psql interpolation and also support a bound-parameter
`set_config` call from a reviewed PostgreSQL driver. Close the dedicated connection
after each execution. Do not use a pooled connection with unreviewed session state.

### Required later Ops production DELETE acceptance (not executed by this repair)

This lifecycle, including temporary synthetic USER/token provisioning, is
**already authorized and required**; it is not an optional test, a new approval
request, or dependent on an existing real test account. Execution remains in the
later parent-owned **post-fresh-QA / exact-final-SHA successful required CI /
verified deployed-artifact** phase; this documentation repair executes none of it.
Never enumerate/select/delete an existing real user draft as a substitute.

Use the exact reviewed `ops-executor/fixtures.cjs`, `draft-smoke.py` and
`search-absence.cjs` under the evidence root
`/Users/kennnyshiwa/.openclaw/workspace-keyatlas/evidence/keyatlas-draft-slug-20260914`.
Follow its `ops-executor/README.md` operator sequence and `RELEASE.md` gates,
checking helper hashes against `qa-rework/ops-fingerprints.json` before execution.
Do not replace these helpers with ad hoc provisioning or SQL draft deletion.
Provision only the two exact synthetic owner/peer identities recorded by the
helper: non-admin role **USER**, NULL email/emailVerified/passwordHash, no signup,
login, OAuth, sessions or mail. Each gets one random bearer with a **60-minute
TTL**, stored only as a SHA-256 hash in the database. Collisions abort; never adopt
an existing account or automatically choose replacement identities.

Keep raw bearer handoff outside source/evidence on durable private operator
storage: owned 0700 directory, exclusive/no-symlink 0600 handoff durable before
COMMIT. No raw tokens in chat, command arguments, receipts or logs. Retain the
helper's exact user/key intent receipts; a lost provision COMMIT response requires
exact-ID inspection/revocation, never reprovisioning or assuming rollback. Use the
reviewed phase gate and explicit execution flags; mutations default to rollback.
Capture fresh Heartbreaker row/source/relations/search before and after this
fixture lifecycle and prove it unchanged.

1. Keep missing/invalid-auth DELETE probes against a unique nonexistent slug:
   expect 401, never 405. Do not use real content for negative probes.
2. Generate a unique release-marked UUID title/slug, then create **one disposable
   owned production draft through `POST /api/projects?intent=draft`** with a valid
   required payload (including category/status). Record 201, returned exact ID and
   slug, creator identity, `published=false`, marker and timestamp. Never proceed
   with deletion without this creation receipt and exact ownership/marker match.
3. Use the reviewed smoke's required `draft-snapshot` checkpoint to record exact-ID
   DB and child/non-FK counts after creation. Require peer USER DELETE 403 and a
   second checkpoint proving the same owned unpublished row/source retained before
   owner deletion. Delete only its returned slug through owner bearer v1 DELETE;
   require 200 JSON `{ "success": true }`, then ID GET 404 and repeat DELETE 404.
   Use only the private synthetic bearer handoff. Promptly revoke the exact keys
   with `fixtures.cjs --action revoke` after HTTP, in a separate commit, including
   on failure; TTL is not a substitute for revocation. Subsequent DB/search proof
   uses existing private operator service access, not revoked app tokens.
4. Verify exact created project absence, FK child cleanup (including comment
   replies), expected SET NULL behavior if applicable, and absence of its
   polymorphic follows/watchlist entries. Record counts even when initially zero;
   do not claim nonempty cascades from a zero-child production fixture. Historical
   notifications/audit references and shared uploads are intentionally not purged.
5. Retain the repeat DELETE 404 receipt from step 3 (before revocation). Verify
   the created ID's search document
   is absent **after relevant Meilisearch tasks complete successfully**. Save
   task UID/status and exact-document lookup/absence receipts, plus DB-vs-search
   final comparison. If draft creation never indexed a document / no task exists,
   explicitly record that fact and the exact-ID not-found receipt; do not invent a
   task or treat a submitted/pending task as completed cleanup. Missing required
   task proof remains an acceptance/cleanup blocker under the reviewed verifier.
   Best-effort app
   search removal is not acceptance by itself.
6. On failure, preserve the creation receipt and determine state by **that exact
   ID/slug/owner/marker only**. A lost POST response must be reconciled using the
   durable requested slug/owner intent; save the exact ID before cleanup and never
   rerun smoke blindly. If the owned unpublished fixture remains, any recovery
   through the tested API must first recheck that exact identity and guard; do not
   delay prompt key revocation or bypass it to retry. If revoked credentials prevent
   recovery, record an exact-ID cleanup blocker for scoped operator follow-up. If
   DB deletion succeeded but search cleanup failed, Ops retries/verifies removal
   of only that created search ID and
   captures the completed task. If ownership/publication/identity changed, stop and
   escalate with the exact receipt; never loosen the draft guard or delete a
   different record. Record final cleanup, or an explicit unresolved exact-ID
   cleanup blocker; never report production acceptance while residue is unresolved.
   A failed or ambiguous lifecycle remains failed even if cleanup succeeds.
7. Use the reviewed `fixtures.cjs` absence/cleanup actions and `search-absence.cjs`
   for exact DB/non-FK/search receipts. The search verifier requires successful
   deletion-window tasks plus exact-ID `document_not_found`; do not bypass a
   missing/failed task, confuse window correlation with exact task attribution, or
   seed production search. Cleanup requires revoke-first, passed/deleted smoke,
   fresh matching search proof and exact identity/reference guards under the
   helper's bounded write-excluding locks in the coordinated quiet window. It
   removes only the two receipted keys/users and matching private handoff; repeat
   inspection to prove absence and preserve ID-only receipts. Unexpected references,
   role/key drift, lock failure or ambiguous HTTP stop cleanup with keys revoked
   and exact-ID follow-up; never CASCADE, bulk-purge or SQL-delete a draft. The
   helper's `no_http_attempted` provisioning-abort path is valid only when no HTTP
   was attempted, never after an ambiguous POST.

## Rollback

Keep alias-capable app code available. Dry-run
`scripts/repairs/20260914-heartbreaker-slug-rollback.sql`, inspect its exact-record
and collision checks using the **saved committed forward receipt's `after`
project/source snapshot**, then deliberately change its final rollback to commit
in a reviewed copy. Do not reuse the pre-repair snapshot. Refresh current full row,
ordered sources and broader relations/search evidence and compare to that saved
postimage before rollback. If any edit occurred since repair, the saved postimage
must fail; stop and explicitly re-review a new rollback preimage before proceeding. It changes only the approved record's slug back. Run the same exact
search helper afterward. Both old/new URLs remain resolvable through immutable-ID
aliases, and both render the record with its current canonical metadata, without redirect loops.
If any precondition changed, stop and re-review; do not force a stale repair.

Reverting all alias code while retaining the repaired data breaks old links. If a
full app rollback is necessary, roll back the data first; keep a minimal alias patch
if links using the newly published name must continue to work after the full revert.
There are no migrations to reverse.

## Implementation and limits

- v1 DELETE supports the installed `kv_` bearer contract and browser session cookies.
  An explicit invalid bearer is rejected rather than falling back to cookies.
  Current DB role is checked. Only owner/admin can delete, and **published records
  are forbidden even to admins**. Authorization and unpublished predicates are
  repeated on the atomic delete; losing a publish/ownership race returns 409.
- DB cascades remove real FK children. Polymorphic follows and watchlist records
  without project FKs are explicitly removed in the same transaction. Web deletion
  uses the same helper, retaining its existing staff policy. Uploaded files are not
  physically removed because assets can be shared.
- Search removal uses the existing web helper after DB commit. It is best-effort
  and logs service failures; distributed DB/search atomicity is not claimed. The
  local runtime did not have a Meilisearch service. Unit tests verify cleanup order;
  parent ops must confirm live search state. No new queue/outbox system was added.
- Legacy support is deliberately bounded to the approved exact identity and its two
  names for detail GET/page and installed-editor PATCH. PATCH retains bearer auth
  and current DB owner/admin checks; nonowner USER/MODERATOR are denied. Installed
  iOS `718ef98` retains `projectToEdit?.slug` for its PATCH and follow-up URL; both
  reserved names now reach the same immutable ID after forward and rollback.
  App create/update and auto-import paths reserve them against reassignment.
  Ad hoc SQL/legacy bulk scripts bypass application validation: ops must continue
  respecting these reservations. No general alias registry or arbitrary slug rewriting.
- The verified Notion source returned `og:title="Notion | Where teams and agents work
  together"`, matching the bad slug. URL prefill now rejects that exact generic
  metadata (and bare Notion) on Notion hosts before importing media or replacing
  fields. Real document titles and unrelated hosts are unaffected; existing custom
  slugs are never rewritten by this guard. This is a narrow recurrence safeguard,
  not an assertion that the full historical corruption sequence is known.
- iOS `718ef98` calls DELETE by edit slug; `requestVoid` decodes `EmptyResponse` from
  every 2xx. The new 200 JSON `{ "success": true }` was decoded successfully using
  that exact Swift type. Browser and bearer runtime checks use synthetic fixtures;
  no installed-device UI test is claimed.

### Other slug-keyed action disposition for this exact record

These are intentionally **not expanded to mutation aliases** in this focused
repair. A previously loaded social/referral view must reload via either detail
alias and use the canonical slug returned by GET. Do not advertise all stale
mutation URLs as supported. Local real-PG route tests exercise both database slug
states, stale 404 with unchanged relations, and canonical behavior:

| Action | Exact repaired-record disposition |
| --- | --- |
| v1 PATCH | Both names work for owner/admin; missing auth 401, nonowner 403. |
| follow POST/DELETE, favorite POST/DELETE, collection POST/DELETE | Canonical-only, published predicate retained; stale name 404, reload required. |
| comments GET/POST | Canonical-only, auth/published predicates retained; stale name 404. |
| referral POST and referral/stats GET | Canonical-only; existing public-published referral and owner/staff stats policies unchanged; stale name 404. |
| project DELETE | Current slug only, auth/owner/admin/unpublished guards unchanged. Heartbreaker is published: canonical name 403 even for admin, stale name 404, no deletion. Unrelated disposable drafts use their returned current slug. |
| Web ID-keyed actions | Already act on immutable project IDs; slug repair does not change IDs or relation targets. |

Ordinary arbitrary-slug rename/cached mutation issues remain outside this bounded
repair. Likewise, the pre-existing successful URL-prefill overwrite of a custom
slug is not fixed here; the new Notion guard only rejects the verified bad source
before prefill/mirroring. No installed-device UI execution is claimed.

## Checks

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run prisma:generate
npx tsc --noEmit
npx vitest run
# Opt-in real DB tests require disposable loopback PostgreSQL initialized with schema:
KEYATLAS_TEST_DATABASE_URL=postgresql://builder_qa@127.0.0.1:55439/keyatlas_builder_qa npx vitest run
npm run lint
npm run build
npm run qa:compose:scheduler
npm run qa:compose:scheduler:integration
```

Build/fetch generation required removing this environment's blocked proxy variables;
no repository proxy/config changes were made. Full lint has existing main-branch
failures; compare against the base instead of fixing unrelated files. Compose
integration requires a running Docker daemon. See builder evidence for actual
commands, results, scoped lint, PostgreSQL races, browser and Swift proofs.
