# Story 73 — Other notes

## Architectural decisions

- **One MongoDB database per user (`beeper_<repoGuid>`), not a shared
  database with an `ownerRepoGuid` field, not collection-name prefixing** —
  this was the user's binding decision from the start, confirmed twice
  (once when the initial plan was presented, once explicitly restated after
  the user flagged it mid-review — the plan had already matched this
  architecture; the restatement was about making the plan document
  unambiguous, not a design change).
- **Reused the existing `runWithRepoContext`/`getCurrentRepoGuid()`
  `AsyncLocalStorage` mechanism** (`packages/dba/src/repo-context.ts`)
  rather than inventing a new one — it already existed and was already used
  by every other `dba` module; Beeper CRM was simply the one feature that
  had never adopted it. This is the same pattern
  `human-docs/dashboard/common/features/chad-user-data-isolation.md`
  documents for Content Provider data.
- **One `MongoClient` per Mongo server, many `Db` handles** (one per
  repoGuid) rather than one client per user — matches the existing
  `dba/mongo.ts` pattern for the `chad`/CP-items connection and avoids
  connection-pool proliferation.
- **`owner-db.mjs` duplicated 3×** (one copy each in `beeper-sync`,
  `beeper-ws`, `beeper-oplog`) rather than factored into a shared internal
  package — matches how these three packages already duplicate their own
  Mongo connection code independently (each can run standalone, on
  different machines, without a shared local package dependency).

## Problems encountered

- **The real "old `beeper` database" wasn't where the plan first assumed.**
  The plan initially described migration as a "local Mac Docker environment
  only" step. Mid-implementation, found that the local dashboard's
  `.env.local` has `DBA_MONGO_MODE=qnap` — meaning the dashboard actually
  reads/writes QNAP's `chad-mongodb` over Tailscale, not the local Docker
  container, and QNAP is also the database shared by QNAP TEST/PROD. Both
  the local Docker Mongo and QNAP's Mongo turned out to hold **identical**
  real data (153/171/3648/... — likely kept in sync by a prior manual
  step, not something this Story investigated further). Flagged this to the
  user before touching anything; user approved proceeding against QNAP with
  an explicit backup → dry-run → approval → apply sequence, which was
  followed. Ended up migrating **both** local and QNAP to keep them
  consistent.
- **No SSH/docker-context access to the QNAP host from this session** —
  `ssh pawelfluder@100.117.139.83` fails (no key-based auth configured
  here), and `docker context ls` shows only the local Docker daemon. This
  meant the existing `bash-scripts/mongo/backup.sh` (which needs `docker
  exec` into the target container) could not be run against QNAP's
  `chad-mongodb` directly. Used the Mongo TCP connection (reachable over
  Tailscale, confirmed with `nc`) with a new driver-based JSON export
  script instead (`backup-beeper-json.mjs`) — same safety intent (a
  restorable point-in-time copy before writing anything), different
  mechanism. Flagged clearly rather than silently substituting one for the
  other.
- **A large, pre-existing, uncommitted `documentation/` → `human-docs/`
  directory rename** was discovered via `git status` (191 changed paths,
  all showing as `D documentation/...` / untracked `human-docs/...`) —
  clearly in-progress work from before this session, unrelated to Story 73.
  Left entirely untouched; only moved the 3 Beeper doc files from
  `human-docs/beeper/` (already in their post-rename, untracked location)
  to the new `ai-docs/beeper/`.
- **The first `--apply` migration run failed at the index-creation step**
  (`BEEPER_MONGODB_URI environment variable is not set`) — the migration
  script's `--uri` flag isn't the same thing as the `BEEPER_MONGODB_URI`
  env var that `dba`'s `ensureBeeperIndexes()` reads internally. The data
  copy itself had already fully succeeded (4368/4368 inserted, confirmed
  before the failure) — re-ran with the env var set, which correctly
  detected the already-migrated documents (0 to insert, matching what was
  already there) and completed the index creation. Also found and fixed a
  missing `process.exit(0)` in the new migration script (the original
  `migrate-contacts-to-chad.mjs` template has this specifically because
  `dba`'s Mongo connection stays open for the lifetime of the process by
  design — a one-shot script needs to exit explicitly).

## Known limitations / not done in this Story

- **QNAP TEST/PROD deployment not performed.** Per the user's own
  instructions (§7 "po mojej osobnej zgodzie", §11 step 16 "zatrzymaj się
  przed PROD") and this repo's deployment rules, this Story stopped after
  local Mac Docker verification + both Mongo servers' data migration. The
  code changes are already reflected in `docker-compose.qnap.test.yml`/
  `docker-compose.qnap.prod.yml` (env var comments/shape updated), but no
  `bash-scripts/dashboard/{04_qnap_test,05_qnap_prod}/*` script was run.
- **`beeper-oplog` still isn't deployed anywhere** (pre-existing, not
  introduced or fixed by this Story) — still gated on the MongoDB
  replica-set migration, unchanged by Story 73's database-selection fix.
- **Old shared `beeper` database not deleted** — per the user's explicit
  instruction, kept on both local and QNAP Mongo as a live backup until
  they separately approve removal after full verification.
- **Live QNAP TEST/PROD isolation testing not performed** (only local Mac
  Docker was browser-tested) — the same login/Beeper-tab/404 checks should
  be repeated against QNAP TEST once that deployment step is approved.

## Follow-up proposals (not part of this Story)

- Once the user is satisfied the per-user model works correctly on QNAP
  TEST, consider a small script to diff/reconcile the local-Mac-Docker and
  QNAP `beeper_<repoGuid>` databases (they were migrated independently from
  two separately-held copies of the old `beeper` data) so they don't
  silently drift apart over time.
- The QNAP backup mechanism gap (no SSH/docker-context access from an
  agent session) is worth a real fix if this pattern recurs — either a
  documented remote `docker context` for QNAP, or a small wrapper script
  that runs `mongodump` over the existing Mongo TCP connection
  (`mongodump --uri=...`) without needing `docker exec` at all.
