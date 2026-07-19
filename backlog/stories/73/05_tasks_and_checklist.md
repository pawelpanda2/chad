# Story 73 — Tasks Checklist

| # | Ai Status | Real Status | Task |
|---|-----------|-------------|------|
| 1 | DONE      |             | `pawel_f`'s Beeper tab still shows his real contacts/channels/messages/stats after the per-user database refactor (no regression) |
| 2 | DONE      |             | `kamil_s`'s Beeper tab shows an empty state instead of `pawel_f`'s data (the critical isolation bug is fixed) |
| 3 | DONE      |             | Directly requesting one of `pawel_f`'s real contact IDs while logged in as `kamil_s` returns `404 Contact not found`, never another user's data |
| 4 | DONE      |             | Background sync processes (`beeper-sync`, `beeper-ws`, `beeper-oplog`) refuse to start without a valid `BEEPER_OWNER_REPO_GUID` |
| 5 | DONE      |             | Old shared `beeper` database is preserved untouched (local + QNAP) as a live backup, not deleted |

# Task 1 — `pawel_f`'s data still works after the refactor

**Requested:** The redesign must not silently break the existing, working Beeper tab for `pawel_f` — isolation must come from database selection, not from breaking functionality.

**Done:** Rewrote `packages/dba/src/mongo.ts`'s `getBeeperMongoDb()` to `getBeeperMongoDb(repoGuid: string)` — validates a full GUID, computes `beeper_${repoGuid}` as the only place the database name is built, one shared `MongoClient` to the Mongo server with one `Db` handle per user. Threaded this through `packages/dba/src/beeper-crm.ts`'s 4 collection helpers (`contactsCol`/`channelsCol`/`messagesCol`/`timelineEventsCol`), which now call `getBeeperMongoDb(getCurrentRepoGuid())` — this single change point covers all ~30 exported functions (list, detail, search, stats, inbox, merge, merge-suggestions, tags, timeline events, export, SSE subscribe) without touching each one individually. `ensureBeeperIndexes()` became `ensureBeeperIndexes(repoGuid)`.

**Files changed:** `packages/dba/src/mongo.ts`, `packages/dba/src/beeper-crm.ts`.

**Tested:** `npx tsc --noEmit` clean on `dba` and `dashboard`. Real-Mongo automated test suite (`packages/dba/src/beeper-crm.test.ts`, 12 cases, run against a throwaway local test database) — all pass. Live browser check (Playwright, local Mac Docker stack rebuilt via `bash-scripts/dashboard/03_local_mac_docker/06_deploy.sh`): logged in as `pawel_f`, Beeper tab shows "103 contacts" with real names/messages (Sprzatanie Agnieszka, Karolina, JanuPol, etc.) — matches the migrated data exactly.

**Status: DONE**

# Task 2 — `kamil_s` no longer sees `pawel_f`'s data (the core bug)

**Requested:** `kamil_s` must never see `pawel_f`'s contacts/channels/messages/stats/merge-suggestions/search results — the actual critical bug reported.

**Done:** All 14 routes under `packages/dashboard/app/api/beeper-crm/**` (`contacts`, `contacts/search`, `contacts/[id]`, `.../avatar`, `.../events`, `.../events/[eventId]`, `.../export`, `.../merge`, `.../profile`, `.../tags`, `inbox`, `merge-suggestions`, `stats`, `events` SSE) already called `getCurrentUserFromCookies()` for the 401 check but then discarded the resolved `repoGuid` — that's the exact bug. Every route now wraps its handler body in `runWithRepoContext(user, async () => { ... })` (the same `AsyncLocalStorage` mechanism `leads.ts`/`reports.ts`/etc. already used — Beeper CRM was the one feature that had never adopted it). The SSE route (`events/route.ts`) needed care: `subscribeToBeeperChanges()` reads `getCurrentRepoGuid()` synchronously inside `ReadableStream`'s `start()`, so the `new ReadableStream(...)` construction itself now happens inside the `runWithRepoContext` callback.

**Files changed:** all 14 files under `packages/dashboard/app/api/beeper-crm/**`.

**Tested:** Real-Mongo test suite covers list/detail/stats/search/merge-suggestions isolation and parallel-request isolation (2 users' requests interleaved via `Promise.all`, verified no cross-contamination). Live browser check: logged in as `kamil_s`, Beeper tab shows "0 contacts" / "No contacts found" (previously would have shown `pawel_f`'s 103 contacts). Live migration verification (direct Mongo queries against both QNAP and local): `pawel_f`'s `beeper_21d11bdc-...` has 153/171/3648/337/59 contacts/channels/messages/sync_state/beeper_events; `kamil_s`'s `beeper_8b603669-...` has 0 across the board.

**Status: DONE**

# Task 3 — Cross-user contact fetch returns 404, not another user's data

**Requested:** A contact from another user's database must be invisible and return `404`, never `403` (to not reveal its existence) and never actual data.

**Done:** No new code was needed for this specific behavior — it falls out of the per-database isolation automatically: `getBeeperContact(id)` does `contacts.findOne({ _id: contactId })` against the caller's own database; a `pawel_f` contact `_id` physically cannot exist in `kamil_s`'s database, so it returns `null`, and `contacts/[id]/route.ts` already turned `null` into `{ ok: false, error: "Contact not found" }` with status 404 before this Story — verified this pre-existing behavior still holds now that the route is also correctly scoped to the caller's own database.

**Files changed:** none beyond Task 2's route wrapping — this was a verification task, not an implementation task.

**Tested:** Live, real HTTP request from an authenticated `kamil_s` browser session (`fetch('/api/beeper-crm/contacts/6a5a687358b3f60a6cfc7758', { credentials: 'include' })`, a real `pawel_f` contact ID taken from his own live contact list) — response: `404`, body `{"ok":false,"error":"Contact not found"}`. Also covered in the automated test suite (`fetching user A's contact id while acting as user B returns null`).

**Status: DONE**

# Task 4 — Background processes require `BEEPER_OWNER_REPO_GUID`

**Requested:** `beeper-sync`, `beeper-ws`, `beeper-oplog` have no Dashboard session, so each must require an explicit, validated owner GUID at startup, with no default user and no fallback to the old shared database.

**Done:** Added `owner-db.mjs` (one small, independent copy per package — `packages/beeper-sync/lib/owner-db.mjs`, `packages/beeper-ws/owner-db.mjs`, `packages/beeper-oplog/owner-db.mjs` — matching how these three packages already duplicate their own Mongo connection code rather than sharing an internal package). `resolveOwnerRepoGuid()` reads and validates `BEEPER_OWNER_REPO_GUID` as a full GUID and calls `process.exit(1)` with a clear message if it's missing or malformed, before any MongoDB connection opens. `ownerDatabaseName(repoGuid)` is the one place each process computes `beeper_${repoGuid}`. Updated `beeper-sync/lib/db.mjs` (used by the real sync pipeline, `index.mjs`/`sync-all.mjs`) and all 9 of `beeper-sync`'s standalone admin/debug scripts (`fix-*.mjs`, `cleanup-*.mjs`, `dedup-messages.mjs`, `enrich-*.mjs`, `inspect.mjs`, `sync-google-contacts.mjs`) plus `beeper-ws/index.mjs` and `beeper-oplog/index.mjs` to call this guard and connect to `beeper_<repoGuid>` instead of the server's default database.

**Files changed:** `packages/beeper-sync/lib/owner-db.mjs` (new), `packages/beeper-ws/owner-db.mjs` (new), `packages/beeper-oplog/owner-db.mjs` (new), `packages/beeper-sync/lib/db.mjs` + all 9 standalone scripts, `packages/beeper-ws/index.mjs`, `packages/beeper-oplog/index.mjs`, plus `.env.mac-beeper`/`.env.mac-beeper.example` (added `BEEPER_OWNER_REPO_GUID`).

**Tested:** `packages/beeper-sync/lib/owner-db.test.mjs` — 6 cases via real child-process spawns (not in-process exception catching, since `resolveOwnerRepoGuid()` deliberately calls `process.exit(1)`): missing env var → exit 1; malformed GUID → exit 1; valid GUID → exit 0 with correct value; two independent process starts with the same env resolve identically (no in-memory drift/"restart doesn't change the owner"); `ownerDatabaseName` never returns the old `beeper` name; `redactMongoUri` hides the password. All 6 pass.

**Status: DONE**

# Task 5 — Old shared `beeper` database preserved as backup

**Requested:** Full backup before migration; never delete the old shared `beeper` database until the user gives separate, explicit approval after full verification.

**Done:** Backed up both physical Mongo servers that held real `pawel_f` data before writing anything: local Mac Docker Mongo via the repo's existing `bash-scripts/mongo/backup.sh` (real `mongodump`, `docker exec` into `chad-mongodb-local-mac-docker`); QNAP's `chad-mongodb` via a new `bash-scripts/mongo/backup-beeper-json.mjs` (a driver-based JSON export, since this session has no SSH/docker-context access to the QNAP host to run the real `mongodump` script there — flagged to the user before running). Then ran a new `bash-scripts/mongo/migrate-beeper-to-per-user.mjs` (modeled on the existing `migrate-contacts-to-chad.mjs`: dry-run by default, `--apply` to write, insert-only/`_id`-preserving, never touches the source) in dry-run against both QNAP and local first, showed the report, got explicit approval, then applied. The source `beeper` database was never written to, updated, or dropped by any of this — confirmed by direct count afterward (still 153/171/3648/... in `beeper` on both servers, unchanged).

**Files changed:** `bash-scripts/mongo/backup-beeper-json.mjs` (new), `bash-scripts/mongo/migrate-beeper-to-per-user.mjs` (new), `bash-scripts/mongo/migrate-contacts-to-chad.mjs` (deprecation note added — this is the *old* Story 59 migration script, superseded).

**Tested:** Backup files exist on disk (`bash-scripts/mongo/backups/2026-07-19_15-04-02/beeper/*.bson` for local, `bash-scripts/mongo/backups/qnap-2026-07-19T.../beeper/*.json` + `report.json` for QNAP). Post-migration direct-count verification on both servers: `beeper` (old) unchanged; `beeper_21d11bdc-...` (pawel_f) has the full migrated dataset; `beeper_8b603669-...` (kamil_s) is empty with indexes created.

**Status: DONE**
