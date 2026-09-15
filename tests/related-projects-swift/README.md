# Shipped related-projects contract

This compiles byte-for-byte `APIClient.swift`, `Project.swift`, and their model
and display dependencies from iOS commit `989d0545ee6eb8013f56ab0ffe080488855803a7`
using **git show only**. No iOS working-tree sources are read or changed.
The existing native-forums test transport intercepts every HTTP request, and its
memory-only KeychainService replaces Security access. APIClient uses its existing
session injection seam; no shipped code is rewritten.

1. Initialize a disposable **loopback** PostgreSQL database from the current schema.
   Its name must start with `related_projects_`; never use production credentials.
2. Set `RELATED_PROJECTS_DATABASE_URL` to that database and
   `RELATED_PROJECTS_CONTRACT_OUTPUT` to an absolute evidence JSON path. Run:

   ```sh
   npx vitest run 'src/app/api/v1/projects/[slug]/related'
   ```

3. Feed the exact serialized production GET response to the Swift checks:

   ```sh
   python3 tests/related-projects-swift/run.py /path/to/KeyAtlas-iOS /new/evidence/swift /evidence/route-response.json
   ```

The runner emits source and response SHA-256 receipts. The suite checks the
shipped APIDataResponse<[Project]> decoder, fields/counts/dates, nullable fields,
and anonymous request behavior even when memory credentials are populated.
A negative check rejects a count changed to a string. It does not build or
release an iOS binary, exercise UI rendering, or contact the live service.
