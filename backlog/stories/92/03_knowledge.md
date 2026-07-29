# Story 92 — Knowledge

- `backlog/stories/91/{03_knowledge,05_tasks_and_checklist,06_others_from_report}.md`
  — read first per the prompt's own resume rule. Story 91 built
  `plugins/beeper-synch` (supervises `beeper-ws`/`beeper-sync`), the
  LaunchAgent (`com.chad.beeper-synch`), and cut `.env.mac-beeper`'s
  `MONGODB_URI` over to real QNAP `beeper-mongodb`. That cutover is
  CORRECT and stays — this Story's own section 1.2 confirms it (the
  writers must target QNAP, not the local mirror).
- `packages/dba/src/dev-db-override.ts` — pre-existing (commit `93a8ae2`,
  predates Story 91) Server/Local Mongo switch:
  `getMongoSource()`/`setMongoSource()` (`"qnap"`/`"local"`),
  `buildBeeperMongoUriForSource()`, `getEffectiveBeeperMongoUri()`,
  `describeEffectiveBeeperMongoTarget()`. Default (no persisted
  preference) is `"qnap"`. Persisted preference file:
  `.runtime/dev-data-source.json` (`{postgres, mongo, chadDataMode}`).
- `packages/dba/src/chad-data-mode.ts` — `isBeeperMongoReadonlyMode()` /
  `assertBeeperWriteAllowed()` (throws `BeeperMongoReadonlyWriteForbiddenError`,
  code `BEEPER_MONGO_READONLY_WRITE_FORBIDDEN`). Already called by every
  mutating function in `beeper-crm.ts` (grep confirmed: `ensureBeeperIndexes`,
  `ensureBeeperSyncPermissionsMigrated`, `updateBeeperContactSyncPermissions`
  (Include/Exclude), `updateBeeperContactProfile`, `addBeeperContactTag`,
  `removeBeeperContactTag`, `addBeeperContactEvent`, `deleteBeeperContactEvent`,
  `mergeBeeperContacts`). Section 1.6's readonly-guard requirement is
  already satisfied at the DBA layer — verify, don't rebuild.
- `packages/dashboard/app/api/dev-settings/db-source/route.ts` — the Dev
  Panel API. `POST` already probes Server Mongo before committing a switch
  to it, and probes (connectivity only, no data-validity check) before
  committing a switch to Local. **Gap**: switching to `"local"` has no
  equivalent of `buildOfflineBackupOptionDetails().available` gate — it
  will happily switch even if local Mongo is empty/never-synced, as long
  as it's reachable. This is what Story 92 needs to close.
- `packages/dba/src/dev-data-source.ts` — `buildBeeperMongoActiveView()`
  (the "ACTIVE" block for the Dev Panel), `BeeperMongoActiveView` interface.
  Has `contactsCount`/`messagesCount`/`connectionStatus`/etc. already; does
  NOT yet have the mirror `lastSuccessAt`/age fields section 1.7 asks for
  (the Postgres equivalent, `ChadDataSourceActiveView`, already has
  `snapshotDate`/`snapshotAge`/`verificationStatus` — same shape needed
  here).
- `packages/dba/src/sync-local-from-qnap.ts` — Story 89's QNAP→local
  mirror for CHAD's own Postgres (`cp_items`/`cp_history`/outboxes) only,
  NOT Mongo. Used as the design template (verify-source-not-behind-dest
  guard, same-host refusal guard, transactional replace) but does not
  itself need touching — Beeper Mongo needs its own, separate mirror
  module (Mongo has no cross-table transaction the way Postgres does, so
  the safe-replace mechanism is per-collection `renameCollection` instead
  of a `BEGIN`/`COMMIT` transaction — see `02_plan.md`).
- `infrastructure/offline-readonly-backup/` — Postgres's heavier, fully
  separate-container emergency-backup precedent (own compose file, own
  `refresh-from-server.sh` doing `pg_dump`/`pg_restore`, own metadata file
  under `$HOME/04_chad_offline_readonly_backup/metadata/latest.json`). NOT
  the pattern to copy for Mongo — Beeper's "local" source already targets
  the SAME already-running `chad-mongodb-local-mac-docker` container used
  by local dev (not a dedicated separate container), so the Mongo mirror
  metadata instead follows the lighter `dev-data-source.json` pattern
  (lives under `.runtime/`, which is already bind-mounted to `/app/runtime`
  in the local Docker dashboard container — confirmed via
  `docker-compose.local.yml`'s `DEV_DB_SOURCE_PREF_PATH` mount).
- `docker-compose.local.yml` — `mongodb` service (`chad-mongodb-local-mac-docker`),
  port 27017 published to host, `--replSet rs0`, **no auth configured**
  (no `MONGO_INITDB_ROOT_*` env set) — confirmed by a real, credential-less
  connection from the host. `.runtime` bind-mounted to `/app/runtime` in
  the `dashboard` service.
- Real measured facts (this session): QNAP `beeper-mongodb` reachable at
  `100.117.139.83:12041` over Tailscale (same as Story 91). pawel_f's
  `beeper_21d11bdc-f1f4-44d1-b61a-3fa6b039c641` on QNAP: contacts=153,
  channels=171, messages=3648, sync_state=337, beeper_events≈59+ (grows),
  timeline_events=0. The SAME database already exists on local Mongo with
  IDENTICAL counts (a prior one-time migration copy, not a live mirror) —
  confirms Story 73/76's migration reached local too at some point. Full
  6-collection / 4368-document copy QNAP→local over Tailscale measured at
  ~2s.
- `ai-docs/beeper/ai-start.md` — already updated once in Story 91; no
  `plugin-beeper-synch`/`gui-beeper` specialization folders exist in this
  repo as of this Story (contrary to the prompt's claim) — documentation
  updates for this Story go here, not into an assumed new location.
