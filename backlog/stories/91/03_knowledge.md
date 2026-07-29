# Story 91 — Knowledge

- `ai-docs/beeper/ai-start.md` -> `architecture.md`, `mongo-schema.md` — the
  per-user (`beeper_<repoGuid>`) Mongo model (Story 73) and standalone
  `beeper-mongodb` (Story 76). `packages/dba/src/mongo.ts`'s
  `getBeeperMongoDb(repoGuid)` is the Dashboard-side equivalent of
  `owner-db.mjs`'s `ownerDatabaseName(repoGuid)` used by the three
  background packages — `beeper-synch` follows the same "own small copy of
  owner-db, no shared package" convention already established across
  `beeper-ws`/`beeper-sync`/`beeper-oplog`.
- `packages/beeper-ws/index.mjs` — raw WS listener, writes only to
  `beeper_events`. No Include/Exclude, no retry/backoff, no lock. This is
  exactly what `beeper-synch`'s process-manager supervises (spawn + backoff
  + graceful stop), not reimplements.
- `packages/beeper-sync/index.mjs` + `lib/sync-channel.mjs` +
  `lib/sync-permissions.mjs` (`resolveSyncMode`) — the one-shot incremental
  REST importer; this is where Include/Exclude is actually enforced. Exits
  0 when done. `beeper-synch`'s scheduler runs this on an interval,
  serialized (no overlap).
- `bash-scripts/beeper/{01_config,02_re-start,03_end,04_status,05_sync,
  health-check-desktop}.sh` — existing manual Mac control scripts for
  beeper-ws/beeper-sync. Left untouched; `beeper-synch` is a separate,
  additive runtime (own PID file, own logs), not a replacement.
- `docker-compose.qnap.shared.yml` `beeper-mongodb` service — standalone
  Mongo (no replica set, by design, Story 76), port 12041, Tailscale
  reachable at `100.117.139.83:12041`.
- `.env.qnap` — `BEEPER_MONGO_ROOT_USERNAME`/`BEEPER_MONGO_ROOT_PASSWORD`,
  the real credentials for `beeper-mongodb` (never committed; read locally
  only to populate the gitignored `.env.mac-beeper`).
- `backlog/stories/76/` — the Mongo split Story; confirms `beeper-oplog` was
  written but intentionally never deployed (see `02_plan.md` decision
  above for why this Story doesn't change that).
- Standalone `content-provider` repo,
  `08_nodejs/content-provider/bash-scripts/04_mac_startup/*.sh` — template
  for the LaunchAgent install/uninstall scripts (label, plist, launchctl
  load/unload pattern).
- `packages/dropbox-sync/package.json`/`tsconfig.json` — closest existing
  in-repo template for a standalone TS worker package (own `tsc` build,
  `tsx` for running tests directly, no shared/hoisted deps — pnpm workspaces
  here are strict, each package declares its own dependencies).
