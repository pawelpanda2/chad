# beeper-synch

Story 91 (Story 100 added the third process below). Mac-only supervisor
process for the existing Beeper sync pipeline. **Not a new sync engine** —
it spawns and supervises the packages that already do the real work:

- `packages/beeper-ws` — long-lived WebSocket listener, Beeper Desktop ->
  `beeper_events` (raw event capture, real-time). Supervised here:
  spawned, restarted with bounded exponential backoff on unexpected exit,
  stopped gracefully on shutdown.
- `packages/beeper-oplog` — long-lived materializer, `beeper_events` ->
  `contacts`/`channels`/`messages` (the collections the Dashboard/GUI
  actually reads). Polls `beeper_events` by `_id` every 5s internally,
  own durable cursor (`beeper_oplog_state`), no replica set required.
  Supervised the same way as `beeper-ws` (long-lived, own SIGINT/SIGTERM
  handling). **This is the continuous "check every few seconds" sync
  mechanism** — not a webhook, since Beeper Desktop's own WS feed
  (consumed by `beeper-ws` above) is already the push side; this just
  turns what it already captured into queryable data.
- `packages/beeper-sync` — REST **historical importer**, one full backfill
  per channel (respects Include/Exclude via its own
  `lib/sync-permissions.mjs`, writes `contacts`/`channels`/`messages`
  directly). Scheduled here on a fixed interval
  (`BEEPER_SYNCH_SYNC_INTERVAL_MS`) mainly as a catch-up safety net for
  channels it hasn't fully backfilled yet — **once a channel reaches
  `fully_synced` it is skipped on every later run** (see
  `lib/sync-channel.mjs`), so this alone never picks up new messages in
  an already-synced channel. Ongoing new-message sync is `beeper-oplog`'s
  job, not this one.

All Beeper protocol handling, Mongo collection writes, permission
filtering, sync-state cursors and the `beeper_<repoGuid>` per-user database
selection stay in those packages — see `ai-docs/beeper/ai-start.md`. This
package only owns: config validation, a single-instance lock, process
lifecycle (start/backoff/graceful stop), a local status file, and exit
codes.

## Config

Reads `<repo root>/.env.mac-beeper` — the same file `beeper-ws`/
`beeper-sync` already use (see `.env.mac-beeper.example` for the full list,
including the orchestrator-only `BEEPER_SYNCH_*` variables added for this
package). No secrets are ever logged — Mongo URIs are redacted before being
printed.

## Run manually

```bash
pnpm --filter beeper-synch build
pnpm --filter beeper-synch start
```

`Ctrl-C` (SIGINT) or `SIGTERM` triggers a graceful shutdown: both child
processes get SIGTERM (SIGKILL after a 5s grace period if they don't exit),
the PID lock is released, then this process exits 0.

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | clean shutdown |
| 1 | unexpected/generic fatal error |
| 2 | invalid configuration (missing env var or sibling package) |
| 3 | another instance is already running (PID lock held) |
| 4 | Mongo preflight failed (unreachable / auth failed) |

## macOS auto-start

See `bash-scripts/beeper-synch/` — `install-startup.sh` installs a
dedicated LaunchAgent (`com.chad.beeper-synch`), independent from the
unrelated Content Provider LaunchAgent (`com.content-provider.startup`,
installed by the separate standalone `content-provider` repo).

## Tests

```bash
pnpm --filter beeper-synch test
```
