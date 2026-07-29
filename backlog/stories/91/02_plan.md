# Story 91 — Plan

## Architecture decisions (made after auditing current repo state)

- Confirmed current pipeline: `packages/beeper-ws` (long-lived WS listener,
  Beeper Desktop -> `beeper_events` collection only) + `packages/beeper-sync`
  (one-shot, manually/cron-run REST incremental importer, respects
  Include/Exclude via `lib/sync-permissions.mjs`'s `resolveSyncMode`, writes
  `contacts`/`channels`/`messages`) + `packages/beeper-oplog` (materializes
  `beeper_events` -> `contacts`/`channels`/`messages`, single-owner-per-process,
  **not deployed anywhere yet**, per its own package.json description).
  `bash-scripts/beeper/` already starts/stops/statuses beeper-ws manually
  (`nohup ... &`, no launchd, no auto-start-at-login) and runs beeper-sync
  as a one-off (`05_sync.sh`).
- `plugins/beeper-synch` will be a thin TypeScript orchestrator that
  **spawns** `packages/beeper-ws` (supervised, backoff-restarted child
  process) and **schedules** `packages/beeper-sync` (periodic incremental
  REST run, one execution at a time) — no reimplementation of WS handling,
  REST pagination, Include/Exclude, or Mongo collection writes. Those stay
  exclusively in the existing packages.
- Real finding: `.env.mac-beeper` (gitignored, real file) still had
  `MONGODB_URI` pointing at `localhost:27017` with placeholder
  `change_me:change_me` credentials — a stale pre-Story-76 config that
  cannot actually authenticate. Confirmed QNAP's `beeper-mongodb` (Story 76)
  is reachable right now from this Mac over Tailscale
  (`100.117.139.83:12041`, `nc` succeeded) with real credentials already in
  `.env.qnap` (`BEEPER_MONGO_ROOT_USERNAME`/`PASSWORD`). Since this Story's
  whole point is Mac -> QNAP Mongo sync, `.env.mac-beeper` gets cut over to
  the real QNAP target as part of this Story (single source of config,
  shared by beeper-ws/beeper-sync/beeper-synch alike — no new duplicate
  variable).
- QNAP/shared-stack decision (prompt section 1.3): **no new container**.
  Beeper Desktop cannot run on QNAP, and the Mac can already write directly
  to `beeper-mongodb` over Tailscale (verified above) — adding a QNAP-side
  "sync" container would be exactly the fictitious duplicate writer the
  prompt warns against. `beeper-oplog` (the one component that could
  legitimately run QNAP-side, since it only consumes `beeper_events` and
  needs no Beeper Desktop) is single-owner-per-process today and was never
  deployed even for one user — deploying it now would silently cover only
  `pawel_f` and misrepresent multi-user readiness. Decision: do **not**
  deploy it in this Story; documented as a follow-up proposal in
  `06_others_from_report.md`, not built.
- Single-instance lock: PID file under `.runtime/beeper-synch/` (repo's
  existing `.runtime/` convention, already gitignored).
- macOS startup: new `bash-scripts/beeper-synch/{install-startup,
  system-startup,un-install-startup}.sh`, modeled on the standalone
  `content-provider` repo's `bash-scripts/04_mac_startup/` pattern but with
  a unique LaunchAgent label (`com.chad.beeper-synch`, vs. the already
  -installed `com.content-provider.startup`), unique plist filename, unique
  log paths (`/tmp/chad-beeper-synch*.log`), own working directory
  (repo root), no shared PID/lock with Content Provider.

## Scope confirmed out of this Story (documented, not silently dropped)

- Multi-tenant `beeper-oplog` on QNAP (needs code change to iterate owners,
  or one container per user) — proposal only.
- Any redesign of `beeper-ws`/`beeper-sync` themselves — untouched, reused
  as-is.
