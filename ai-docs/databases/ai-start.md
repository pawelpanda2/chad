# Databases — start here

Read `ai-docs/databases/red-rules.md` **first** — it lists the fixed rules
for this area. This file is the orientation map; that file is the law.

## The current architecture (2026-07-27)

| Environment | CHAD cp_items backend | Beeper backend |
|---|---|---|
| LOCAL (normal mode) | Server PostgreSQL (QNAP `chad-postgres`), over Tailscale | Beeper MongoDB (QNAP `beeper-mongodb`), over Tailscale |
| LOCAL (`offline-readonly-backup` mode) | Local read-only PostgreSQL snapshot — emergency only, see red-rules.md Rule 3 | unaffected |
| QNAP TEST | Server PostgreSQL (same `chad-postgres`, same data as PROD) | Beeper MongoDB |
| QNAP PROD | Server PostgreSQL (same `chad-postgres`, same data as TEST) | Beeper MongoDB |

**TEST and PROD share one PostgreSQL database.** This is deliberate — see
`docker-compose.server1.test-prod.dashboard.yml`'s own header comment for
why the two environments used to run on different backends (`postgres` on
TEST vs a defaulted `mongo` on PROD) and why that was the root cause of a
real bug (a folder's Text Items existing in Postgres but never appearing on
PROD, which still read Mongo).

`chad-mongodb` (CHAD's own legacy Mongo, separate from `beeper-mongodb`) —
**the service itself no longer exists** (2026-07-27, full runtime removal,
not just a disabled flag): removed from `docker-compose.qnap.shared.yml`
entirely (no service, no volume, no port, no healthcheck), and no CHAD
compose file wires a `MONGODB_URI` pointing at it anymore. `DBA_MONGO_ENABLED`
still defaults to `true` in `packages/dba/src/data-providers/config.ts` —
that's a **library** default for reuse by other projects, not something
CHAD's own compose ever relies on (CHAD's compose always sets it to
`false` explicitly). There is no fallback path from Postgres to Mongo
anywhere — if Postgres is unavailable, the request/process fails loudly.
The final data lives only in a named, timestamped backup (see
`.runtime/backups/cp-data/` and `packages/dba/scripts/backup-cp-data.mjs`)
— never restore it into an active connection without an explicit decision
to do so.

The reusable Mongo CP provider (`packages/dba/src/data-providers/
mongo-cp-provider.ts`) and its config surface are untouched — a different
project can still configure `DBA_PRIMARY_BACKEND=mongo` +
`DBA_MONGO_ENABLED=true` + its own `MONGODB_URI` against its own Mongo.
CHAD itself simply never activates that path.

## Where the actual connection logic lives

- `packages/dba/src/dev-db-override.ts` — the one place that decides, at
  runtime, which physical Postgres/Mongo a LOCAL process talks to
  (`ChadPostgresSource` / `DbSource`). QNAP TEST/PROD don't use this
  override mechanism at all — their backend is fixed directly in
  `docker-compose.server1.test-prod.dashboard.yml`'s environment block
  (`DBA_PRIMARY_BACKEND=postgres`, hardcoded identically for both
  environments, not a `${VAR:-default}` read).
- `packages/dba/src/chad-data-mode.ts` — `CHAD_DATA_MODE` /
  `assertChadWriteAllowed()` / `isOfflineReadonlyBackupMode()`, the guard
  that blocks writes when LOCAL is in `offline-readonly-backup` mode.
- Dev Panel → Settings tab (`packages/dashboard/components/dev-panel/
  dev-panel-data-source.tsx`) is the UI for switching LOCAL's Postgres
  source and for seeing, honestly, which one is currently active — never
  trust a cached assumption about which source is active; that panel (or
  `GET /api/dev-settings/db-source`) is the runtime source of truth for
  LOCAL only. It is disabled entirely outside LOCAL (`CHAD_ENVIRONMENT` /
  `NODE_ENV` checks in `assertDevOnly()`), so it has nothing to say about
  what TEST or PROD are actually doing — check their own compose
  environment block for that. The panel shows exactly two CHAD Postgres
  options (`Server PostgreSQL` / `Offline backup — read only`, native radios
  + Apply) and a separate Beeper Mongo radio group (`Server Mongo` /
  `Local Mongo`) — never a CHAD-Mongo option, never a CHAD-Mongo fallback
  status. GET probes use a short timeout so a dead Tailscale host cannot
  hang Settings; switching to offline never probes the remote server.
- `getEffectiveMongoUri()`/`getEffectiveBeeperMongoUri()` in
  `dev-db-override.ts` share the same `currentMongoSource` toggle state but
  resolve to genuinely different things: the former is CHAD's legacy
  (now-unused-in-practice) Mongo resolver, the latter is Beeper's real one.
  `describeEffectiveBeeperMongoTarget()` (not `describeEffectiveMongoTarget()`)
  is what the Dev Panel's Beeper block must call — the two were previously
  conflated (a real bug: Beeper's "qnap" fallback path used to authenticate
  with CHAD's own Mongo credentials/port), fixed 2026-07-27.

## Backups

`packages/dba/scripts/backup-cp-data.mjs` — read-only, timestamped JSON
dump of `cp_items`/`cp_history`/both outboxes from whichever Postgres/Mongo
`POSTGRES_URI`/`MONGODB_URI` point at. Run before any backend-routing
change. Output goes to `.runtime/backups/cp-data/<timestamp>/` (gitignored).

`packages/dba/scripts/restore-cp-data-from-backup.mjs <backup-dir>` — the
restore counterpart. Idempotent (`ON CONFLICT DO NOTHING` on every table),
safe to re-run, never overwrites an existing row.

## Integrity

`packages/dba/scripts/cp-postgres-integrity-check.mjs (--repoGuid=<guid> |
--all)` — read-only Postgres-internal consistency check (address/name
invariants, history hash-chain, version continuity). Add `MONGODB_URI` to
additionally cross-check row counts against the legacy Mongo copy (informational
only now that Mongo isn't the source of truth — a mismatch there is
expected, not a failure, unless you're specifically auditing the legacy
Mongo copy for some other reason).
