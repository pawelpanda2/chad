# Red rules — CHAD databases

Non-negotiable. These are fixed architectural decisions, not open questions,
and not regressions to "fix" if you rediscover them while investigating
something else. If a behavior below looks surprising or looks like a bug,
it is very likely intentional — check this file before changing it.

**AI trap (powtarza się):** kontener `chad-postgres-local-mac-docker` /
port hosta `:5433` **nie jest** domyślnym źródłem Dashboardu LOCAL.
Domyślnie aplikacja czyta **Server PostgreSQL przez Tailscale**
(`100.117.139.83:12042`). Pusta lokalna volume ≠ „brak danych użytkownika”.
Zanim ocenisz dane: Dev Panel / `GET /api/dev-settings/db-source`, albo
odpytaj QNAP. Skrót też w `ai-docs/begin_here/01_ai_start.md` (Błąd A).

## Rule 1 — LOCAL connects to the real shared Server PostgreSQL over Tailscale

CHAD TEST, CHAD PROD, and LOCAL development all use the **same one shared
PostgreSQL** (`chad-postgres` on the QNAP host). There is no separate "local"
CHAD Postgres database anymore.

- LOCAL reaches it over Tailscale (`100.117.139.83:12042`), the same way the
  Dev Panel's "Server" source and every diagnostic script in this repo do.
- This is full read/write access to the real, live data — not a mirror, not
  a copy.
- This must always be an **explicitly selected** mode, never a silent
  fallback. The Dev Panel must always show plainly that LOCAL is currently
  reading/writing the real shared server database (see
  `packages/dba/src/dev-db-override.ts`'s `ChadPostgresSource` and the Dev
  Panel's data-source tab).
- `offline-readonly-backup` (Rule 3) is the only other valid Postgres source
  for LOCAL. There is no third "local mirror" option.

**Do not** reintroduce a "local Postgres" mode, and do not add logic that
silently redirects a Postgres connection away from the server without the
developer explicitly choosing `offline-readonly-backup`.

## Rule 2 — Beeper contacts live in Mongo, reached the same way (Tailscale)

Beeper CRM data lives in its own MongoDB (`beeper-mongodb` on the QNAP
host) — the ONLY active Mongo in CHAD's runtime. CHAD's own legacy Mongo
(`chad-mongodb`) was fully removed on 2026-07-27 — no service, no volume,
no port, no connection string anywhere in an active compose file. See
`ai-docs/databases/ai-start.md`.

- LOCAL reaches Beeper Mongo over Tailscale, exactly the same pattern as
  Rule 1: `getEffectiveBeeperMongoUri()` in `dev-db-override.ts` — never
  `getEffectiveMongoUri()` (CHAD's legacy resolver, dead code kept only
  because deleting library functions wasn't in scope).
- This is a live connection to the real shared Beeper data, not a mirror.
- Beeper Mongo is unaffected by anything CHAD does with Postgres. Never
  reintroduce a CHAD-Mongo connection string, never let `MONGO_ROOT_*`
  (CHAD's old credentials) be reused for Beeper — Beeper has its own
  `BEEPER_MONGO_ROOT_USERNAME`/`BEEPER_MONGO_ROOT_PASSWORD`.

## Rule 3 — `offline-readonly-backup` is read-only, emergency-only, and never the source of truth

See `infrastructure/offline-readonly-backup/README.md` for the operational
detail; the rules themselves are fixed:

- **Only** use it when there is no internet, no Tailscale, the server is
  unreachable, and you need to urgently look at existing data.
- **Never** use it for development, daily work, writes, migrations, write
  tests, Google Sheets, outboxes, sync, or creating new data.
- All INSERT/UPDATE/DELETE must be blocked against it. Write forms, Google
  Sheets sync, and the outbox workers must all refuse to run against it
  (`isOfflineReadonlyBackupMode()` / `assertChadWriteAllowed()` in
  `packages/dba/src/chad-data-mode.ts`).
- It is refreshed only manually (`pg_dump` from the real server, restore,
  re-verify read-only, record the snapshot time) — never automatically,
  never as part of a migration.
- It can be arbitrarily stale. It is never treated as a source of truth.
  The only source of truth for CHAD is the real shared server PostgreSQL.

## Why this file exists

An earlier investigation session (2026-07-27) initially treated Rule 1 as a
bug — "local test/dev connections shouldn't silently hit the real shared
database" — and nearly "fixed" it by changing the redirect logic. That
diagnosis was wrong: the developer confirmed this is the intended
architecture. Read this file before touching
`packages/dba/src/dev-db-override.ts`'s source-selection logic.
