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

`chad-mongodb` (CHAD's own legacy Mongo, separate from `beeper-mongodb`) is
**not** an active CHAD backend anymore. `DBA_MONGO_ENABLED=false` in every
TEST/PROD environment. It is kept only as a historical rollback artifact —
see `.runtime/backups/cp-data/` for point-in-time JSON dumps and
`packages/dba/scripts/backup-cp-data.mjs` /
`packages/dba/scripts/restore-cp-data-from-backup.mjs` for the backup/
restore tooling. Do not wire it back into the primary/follower router
without an explicit decision to do so (see `packages/dba/src/data-providers/
config.ts`'s own doc comments on the primary/follower model).

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
  environment block for that.

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
