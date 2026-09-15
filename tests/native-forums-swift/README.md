# Shipped native forum contract

No iOS checkout edits, app build or real credentials required. `run.py` reads git objects pinned to shipped iOS `989d0545ee6eb8013f56ab0ffe080488855803a7`.

1. Run the production route integration test against a **disposable loopback PostgreSQL database ending `_qa`**, initialized from `prisma/schema.prisma`:

   ```sh
   KEYATLAS_TEST_DATABASE_URL=postgresql://USER@127.0.0.1:PORT/forums_qa \
   FORUM_CONTRACT_OUTPUT=/absolute/path/detail.json \
   npx vitest run src/lib/forums/native-forums.integration.test.ts
   ```

   Optional `FORUM_TEST_REDIS_URL=redis://127.0.0.1:PORT` enables actual Redis/Lua concurrent cross-path quota coverage; use a disposable instance. Tests remove only their exact owned keys. All notification transports are mocked; DB/auth/route/notification persistence functions are real.

2. Run the native harness on macOS with Swift 6:

   ```sh
   python3 tests/native-forums-swift/run.py /path/to/KeyAtlas-iOS /new/output/directory /absolute/path/detail.json
   ```

The production Forum models, UserSummary, ViewModels and APIClient method bodies execute against a URLProtocol-only ephemeral session. The harness changes only the staged APIClient singleton initialization to its existing `init(session:)` injection seam; no production source is edited. The exact `NewThreadView.createThread` method is extracted into a state-only shell, avoiding SwiftUI UI dependencies. Credentials are memory-only doubles. Every URL is intercepted; unknown hosts fail locally. Source hashes and pinned revision are saved in the output.

Assertions cover actual native POST path/body/auth, anonymous detail, real server JSON decoding (snake case, nested posts, dates, public author), authenticated reply and subsequent detail reload. This is executable contract evidence, not a simulator UI or deployed acceptance test.
