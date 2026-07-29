# Story 92 — Plan

## Starting state confirmed (not assumed)

- `git log -1` = `f33259b` (Story 91's own commit), no newer commits — no
  parallel session has pushed since. Working tree still carries the SAME
  3 pre-existing unrelated modified files noted in Story 91
  (`bash-scripts/dashboard/03_local_mac_docker/03_re-start.sh`,
  2 `packages/Binaries/...` files, `packages/dashboard/components/dev-panel/
  dev-panel.tsx`) — not mine, left untouched again.
- No Story newer than 91 exists. No `ai-docs/*/plugin-beeper-synch` or
  `ai-docs/*/gui-beeper` folders exist yet (`find ai-docs -maxdepth 3`) —
  the prompt's claim of an already-done ai-docs reorg does not match the
  actual tree; documentation updates for this Story go into the existing
  `ai-docs/beeper/` specialization instead of an assumed new location.
- `com.chad.beeper-synch` LaunchAgent from Story 91 is still installed and
  running as exactly one instance (pid unchanged since Story 91's last
  action), no orphan `beeper-ws`/`beeper-sync` children.
  `com.content-provider.startup` unaffected. One stale leftover found:
  `.runtime/beeper/beeper-ws.pid` (dead pid, from the OLD pre-Story-91
  manual `bash-scripts/beeper/02_re-start.sh` mechanism) — safe to remove,
  logged in the cleanup audit table, not touched blindly.
- **Major finding that reframes this Story's scope:** a real, already-
  merged Server/Local Mongo readonly-switch mechanism for Beeper CRM
  already exists (commit `93a8ae2`, predates Story 91): `packages/dba/src/
  dev-db-override.ts` (`getMongoSource`/`setMongoSource`, "local"/"qnap"),
  `packages/dba/src/chad-data-mode.ts` (`assertBeeperWriteAllowed()` — this
  guard is ALREADY wired into every mutating `beeper-crm.ts` function:
  `ensureBeeperIndexes`, `updateBeeperContactSyncPermissions` (Include/
  Exclude), `updateBeeperContactProfile`, `addBeeperContactTag`/
  `removeBeeperContactTag`, `addBeeperContactEvent`/
  `deleteBeeperContactEvent`, `mergeBeeperContacts`), and a working Dev
  Panel API (`packages/dashboard/app/api/dev-settings/db-source/route.ts`)
  that already returns most of the fields section 1.7 asks for (contacts
  count, messages count, host/port/database, read/write access,
  connection status). Default is already "qnap" (Server Mongo) per Red
  Rules Rule 2. **This Story does not need to build sections 1.6/1.7 from
  scratch** — it needs to close the one real gap: there is currently no
  mechanism that keeps "Local Mongo" populated as an actual mirror of
  QNAP (no Mongo equivalent of `packages/dba/src/sync-local-from-qnap.ts`,
  which only handles CHAD's own Postgres). "Local" mode today just reads
  whatever happens to already be in the local Docker Mongo container —
  real per-user data (from an earlier one-time Story 73/76 migration copy,
  confirmed: `contacts=153 messages=3648 channels=171` for pawel_f,
  matching QNAP) but never kept fresh, and nothing gates switching to
  "local" on the mirror actually being valid (unlike Postgres's
  `buildOfflineBackupOptionDetails()` gate).
- Confirmed local Mongo (`chad-mongodb-local-mac-docker`, already running,
  healthy, `--replSet rs0`) has **no auth configured** — reachable at
  `mongodb://localhost:27017/?directConnection=true` with no credentials.
- Measured a real full copy of all 6 collections / 4368 documents for
  pawel_f's `beeper_<repoGuid>` from QNAP to local over Tailscale: **~2
  seconds**. Per the prompt's own guidance ("if a full snapshot is cheap
  enough, prefer it over a pseudo-incremental mechanism that drops
  deletes — but measure first"), this justifies a full stage→verify→swap
  refresh every 5 minutes, gated by a cheap `countDocuments` pre-check per
  collection so a genuinely idle QNAP doesn't do the heavier copy every
  cycle (satisfies both "check for changes first" and "prefer the simple
  full-snapshot approach" requirements). Known, documented limitation: a
  same-document-count content edit (e.g. a tag change with no insert/
  delete) is only caught on the next cycle where SOME collection's count
  also changes — acceptable for a best-effort emergency mirror, not
  acceptable to silently hide from the report.

## Design

1. **New DBA module** `packages/dba/src/beeper-mongo-mirror/` (constants,
   metadata read/write — same atomic-tmp-then-rename pattern as
   `dev-db-override.ts`'s `persistSources`, and the same shape/spirit as
   `offline-readonly-backup/metadata.ts` — and the actual
   `refreshBeeperMongoMirror()` function: connect source (QNAP) + target
   (local), per-collection count pre-check, on change: copy every
   collection into a `beeper_<repoGuid>__mirror_staging` database on the
   SAME local mongod, verify staged counts equal source counts, then
   per-collection `renameCollection` with `dropTarget: true` from staging
   into the live `beeper_<repoGuid>` mirror database (atomic per
   collection; the live mirror is never touched until staging is fully
   verified, so a crash mid-copy leaves the last-good mirror untouched and
   only a discarded staging DB, cleaned up idempotently on the next run).
   Recreates the same indexes `beeper-crm.ts`'s `ensureBeeperIndexes` uses
   (duplicated intentionally, matching the repo's own established pattern
   of small per-purpose Mongo connection/index copies — this is
   maintenance-writer code, not CRM business logic, and never goes through
   `assertBeeperWriteAllowed()`, which correctly only gates the
   Dashboard's own business mutations).
2. **plugins/beeper-synch** gains a `dba` workspace dependency and a new
   in-process `MirrorRunner` (parallel to the existing `PeriodicRunner` for
   `beeper-sync`, but calling `refreshBeeperMongoMirror()` directly instead
   of spawning a child process — this IS the "thin dedicated module" the
   prompt's option A asks for, not logic stuffed into `index.ts`), on its
   own `BEEPER_SYNCH_MIRROR_INTERVAL_MS` (default 5 min), independent of
   `beeper-ws`'s health (the mirror only needs QNAP, never Beeper Desktop).
   Its state feeds into the SAME `status.json` beeper-synch already writes
   (prompt 3.4 — no second status file).
3. **New, clearly-separate env var** `BEEPER_LOCAL_MIRROR_MONGODB_URI` in
   `.env.mac-beeper` (default `mongodb://localhost:27017/?directConnection=true`)
   — deliberately NOT reusing the Dashboard's `BEEPER_MONGODB_URI` (a
   different env file, `.env.local`, with different in-container-vs-host
   resolution logic that doesn't apply to a plain Mac-host Node process).
   Source stays `MONGODB_URI` from `.env.mac-beeper` (already QNAP, same
   value the writers use — correct to reuse, it's the same "Server Beeper
   Mongo" target). A same-host sanity guard (like
   `sync-local-from-qnap.ts`'s) refuses to run if source and target somehow
   resolve to the same host.
4. **Dev Panel gap-closing** (not a rebuild): thread `repoGuid` into
   `buildBeeperMongoActiveView()` so it can read the per-user mirror
   metadata file and expose `localMirror: { lastCheckedAt, lastSuccessAt,
   ageFormatted, result, collections }`; add
   `buildBeeperLocalMirrorOptionDetails(repoGuid)` (mirrors
   `buildOfflineBackupOptionDetails()`) and wire it into the `POST
   .../db-source` handler's `mapped === "local"` branch so switching is
   refused with a clear error when no valid/successful mirror exists yet —
   closing the one real gap in section 1.7 relative to what's already
   built. UI changes to `dev-panel.tsx` are additive only, layered onto
   whatever the parallel session's still-uncommitted edit already has on
   disk (read current file content first, never blind-overwrite).
5. Cleanup: remove the one confirmed-stale `.runtime/beeper/beeper-ws.pid`
   leftover after logging it in the audit table; nothing else in the
   audit list currently qualifies as obsolete (see `03_knowledge.md`/
   `05_tasks_and_checklist.md` for the full table).
6. Contacts verification (section 1.8) happens AFTER the mirror mechanism
   exists and Beeper Desktop is confirmed — diagnosis-first per the
   prompt, no blind re-migration.
