# Import image mirror retry

Imports (Geekhack auto-import, URL prefill, repair scripts) copy third-party
images (Imgur, Geekhack attachments, Drop/imgix, `i.postimg.cc`) into KeyAtlas
storage via `src/lib/import/imgur-mirror.ts`. When a mirror fails, the import
still succeeds and hotlinks the original URL. The failure is recorded so it can
be retried later instead of hotlinking forever.

## Download limits

- At import time, timeouts are per source: 12 s for Imgur/Geekhack/Drop and
  30 s for `i.postimg.cc`. The retry job uses 120 s for every source, since
  `i.postimg.cc` can take ~100 s for an 860 KB file from the prod server.
- The timeout is a total deadline for connect + headers + the streamed body:
  `safeFetch` passes `AbortSignal.timeout()` to `fetch`, and Node's fetch keeps
  that signal active while the body is read (covered by a test against a local
  server). A redirect is followed with a fresh timeout, so the worst case is
  about 2x. SSRF checks in `safeFetch` are unchanged.
- The body is streamed and aborted as soon as it exceeds 20 MB. If the response
  has an identity-encoded `Content-Length`, the bytes read must match it, so a
  short read fails instead of storing a truncated image.
- A `200` response that is not a valid image (wrong content type or failed
  magic-byte check) counts as permanent, the same as 404/410.
- When a mirror fails, the hotlink fallback is the normalized URL, so stored
  hero and gallery values equal the failure row's `sourceUrl`.
- Import-time mirroring has a total time budget of 90 s per call
  (`IMPORT_MIRROR_TIME_BUDGET_MS`). This covers `mirrorImportMedia`,
  `mirrorImportImageSrcsInHtml` and `mirrorPrefillImages`.
  - Each fetch's timeout is capped at the time left in the budget, so a fetch
    already in progress can't run past it.
  - Once the budget is spent, the remaining mirrorable URLs are not fetched.
    Each one is recorded as a `PENDING` failure with
    `lastError = 'import mirror budget exhausted'` and keeps its original URL
    (hotlink). An existing row is left untouched, so its real `lastError` is
    kept.
  - The geekhack prefill route and URL prefill go through `mirrorImportMedia`.
    It mirrors gallery images with up to 4 fetches at a time
    (`IMPORT_MIRROR_CONCURRENCY`), keeping their order. Once the whole gallery
    is done, it mirrors description-only images one at a time, all under one
    budget. A URL used more than once is fetched only once, even when the
    duplicates are in flight at the same moment.
  - geekhack-scan imports projects one after another, so each imported project
    spends at most about 90 s mirroring, however many slow images it has.
  - Pass `{ budget }`, `{ budgetMs }` or `{ clock }` to change the budget, for
    example in tests.

## Table: `image_mirror_failures`

| Column | Meaning |
| --- | --- |
| `sourceUrl` (unique) | Normalized source URL (`normalizeMirrorableImageUrl`) |
| `source` | `imgur` / `geekhack` / `drop` / `postimg` |
| `status` | `PENDING`, `RESOLVED` or `GAVE_UP` (enum `ImageMirrorFailureStatus`) |
| `attempts` | Retry-job download attempts. The original import failure is not counted. |
| `rewriteFailures` | Failed reference-rewrite passes after the image was mirrored |
| `lastError`, `lastAttemptAt` | Most recent failure (import-time or retry) |
| `nextAttemptAt` | When the row is next due. Indexed with `status`. |
| `resolvedUrl` | Mirrored URL, written as soon as the retry downloads the image (the row stays `PENDING` until all rewrites succeed) |

How import-time failures are recorded (`recordImageMirrorFailure`, never
throws):

- A new URL is inserted as `PENDING`, due immediately.
- An existing row of any status only has `lastError` and `lastAttemptAt`
  refreshed. Rows are never reset from `GAVE_UP`/`RESOLVED` and their backoff
  is left alone.
- If the row already has a `resolvedUrl` (either `RESOLVED`, or `PENDING` with
  rewrites outstanding), the import uses it instead of hotlinking.

Each failure logs `[image-mirror] failed <source> <url>: <error> — recorded for retry`.

To retry a `GAVE_UP` row by hand, run:
`UPDATE image_mirror_failures SET status='PENDING', "nextAttemptAt"=now() WHERE "sourceUrl"='…';`

## Cron route: `GET /api/cron/image-mirror-retry`

Auth: `Authorization: Bearer $CRON_SECRET`, the same as the other
`/api/cron/*` routes. Optional `?limit=` (default 25, max 100).

Each run (`retryFailedImageMirrors` in `src/lib/import/image-mirror-retry.ts`)
does the following:

1. Selects due rows (`PENDING` with `nextAttemptAt <= now`), oldest first, up to
   `limit`. It claims each row with a 10-minute lease so overlapping runs don't
   process the same row twice.
2. Finds projects that reference the URL in `projects.heroImage`,
   `project_images.url`, or `projects.description`. If none do (for example, a
   prefill that was never saved), it skips the download and counts a failed
   attempt. A row that already has a `resolvedUrl` and no references goes
   straight to `RESOLVED`.
3. Downloads the image with a 120 s timeout and immediately writes
   `resolvedUrl`, keeping the row `PENDING`. If an earlier run already mirrored
   it, the existing `resolvedUrl` is reused and nothing is downloaded.
4. **Rewrites** references that still equal the source URL. Each project is
   updated in its own transaction:
   - Hero and gallery URLs must match exactly.
   - In the description, only `<img src>` and `<a href>` attributes are
     rewritten, including `&amp;`-encoded forms (`rewriteImportImageUrlsInHtml`).

   Values someone has edited since the import are left alone. If the
   description changed between read and write, the compare-and-swap loses and
   that project is retried on a later run. `projects.updatedAt` is preserved,
   and changed projects are re-indexed in Meilisearch if they are published.

   The row becomes `RESOLVED` only after every referencing project has been
   rewritten. If any rewrite fails, the row stays `PENDING` with `resolvedUrl`
   and is retried every hour. These retries don't download again and don't add
   to `attempts`; they increment `rewriteFailures` instead (this includes
   compare-and-swap losses). After 24 failed rewrite passes
   (`MAX_IMAGE_MIRROR_REWRITE_FAILURES`), the row becomes `GAVE_UP`, keeps its
   `resolvedUrl`, and gets a `lastError` starting "Gave up after 24 failed
   reference rewrites". Imports of that URL still use the mirrored copy.
   Rerunning a `RESOLVED` row is a no-op.
5. **On failure:** adds 1 to `attempts`, records `lastError`, and sets
   `nextAttemptAt` with a backoff of 1 h, 4 h, 12 h, 24 h, then 48 h for every
   later attempt. After 8 attempts the row becomes `GAVE_UP`. HTTP 404/410,
   oversize images, and 200 responses that are not valid images go to
   `GAVE_UP` immediately. If writing the outcome itself fails, it is reported
   once in `errors` and the row is retried after its 10-minute lease.
6. Stays within limits: at most `limit` rows, and a new attempt starts only if
   its 120 s timeout still fits in a 4-minute budget. If the budget runs out,
   the run reports `stoppedEarly`.

The response has `scanned`, `resolved`, `failed`, `gaveUp`, `unreferenced`,
`skipped`, `stoppedEarly`, `rewrites: {hero, gallery, description}` and
`errors[]`. It also includes `counts: {pending, due, resolved, gaveUp}` across
the whole table.

## Scheduling

An OpenClaw cron job on the operator Mac runs the route over ssh, the same way
`geekhack-scan` is run:

```sh
ssh <prod-host> "cd <compose-dir> && docker compose exec -T app sh -lc 'wget -qO- --header=\"Authorization: Bearer \$CRON_SECRET\" \"http://127.0.0.1:3000/api/cron/image-mirror-retry\"'"
```

Watch `counts.pending` and `counts.gaveUp` in the JSON output.

## Caveat: the prod server is slow to Postimg

The prod server's own network path to `i.postimg.cc` is very slow, so retries
there may keep failing until the rows reach `GAVE_UP`. To catch up, use the
Mac-side backfill in `projects/keyatlas-postimg` (`download.py`,
`prepare-batch.py`, `run-batch.sh`, `mirror-one.ts`, `apply-batch.ts`):

1. Download the images on a fast network.
2. Upload them from inside the app container.
3. Rewrite the project references.

After a backfill, mark the matching rows `RESOLVED` and set their
`resolvedUrl`, so later imports of the same URL reuse the mirrored copy.
