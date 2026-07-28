# tests/

Regression suite for CHAD, organized into 4 fixed pillars plus one shared
support folder. This replaces the old `test/` directory and the old
`tests/tables-sync/` / `tests/offline-readonly-backup/` / `tests/backend-config/`
directories — every file that used to live there was moved (`git mv`, history
preserved), not deleted, into one of the pillars below.

```
tests/
├── 1_1_data-protection/{description.md, unit/, integration/, e2e/}
├── 1_2_google-sheets-sync/{description.md, unit/, integration/, e2e/}
├── 1_3_history-integrity/{description.md, unit/, integration/, e2e/}
├── 1_4_tables-release/{description.md, daily/{unit,integration,e2e}, dates/{...}, leads/{...}}
└── support/{database/, users/, google-sheets/, assertions/, fixtures/}
```

Each pillar's `description.md` states, in one short paragraph, what change
requires that pillar's regression to pass before the related task is
considered finished. **None of these are required before every commit** —
only before finishing a task in that area, and before a release audit
(`pnpm test:regression:release-audit`).

## The 4 pillars

- **`1_1_data-protection/`** — database backend isolation (no CHAD-Mongo
  runtime), login/session, repo context, offline-readonly-backup mode. See
  its `description.md`.
- **`1_2_google-sheets-sync/`** — Daily/Dates/Leads <-> Google Sheets sync:
  outbox, mapper, worker, headers, config validation, History's Google
  Sheets status. See its `description.md`.
- **`1_3_history-integrity/`** — cp_history correctness: one entry per
  mutation, before/after, operationId, History API/UI. See its
  `description.md`.
- **`1_4_tables-release/`** — functional readiness of Daily Tracker, Dates,
  and Leads for the end user (GUI, API, DBA, data, History, Google Sheets),
  split into `daily/`, `dates/`, `leads/` sub-folders each with their own
  `unit/`, `integration/`, `e2e/`. See its `description.md`.

## unit / integration / e2e

- **`unit/`** — pure logic, no network/DB/browser. Runs anywhere, always
  safe.
- **`integration/`** — talks to a real database or real HTTP API (local
  Postgres/Mongo, a locally-running dashboard, or — for QNAP-targeting
  files, named `qnap-test3-*` — the real, already-running QNAP TEST
  deployment over Tailscale). Never starts its own server.
- **`e2e/`** — Playwright, against a real, already-running dashboard
  (`localhost` for `local-*` specs, QNAP TEST for others) — never a
  locally-started dev server spun up by the test itself.

## Local vs QNAP TEST vs real Google Sheets

- Files named `local-*` run against `localhost` (a dashboard you started
  yourself) or local Postgres/Mongo.
- Files named `qnap-test3-*` run against the **real, already-running QNAP
  TEST** deployment (`100.117.139.83:12020`) over Tailscale, scoped to
  test3's own repoGuid (`tests/support/database/qnap-env.mjs`,
  `tests/support/users/provision-test3.mjs`). They never touch
  pawel_f/kamil_s data.
- `tests/1_2_google-sheets-sync/integration/qnap-test3-google-sheets.test.mjs`
  is explicitly labeled in its own header comment as a **real Google Sheets
  write test** against test3's own dedicated spreadsheet (never pawel_f's or
  kamil_s's). It `describe.skipIf`s (never fails) when the service-account
  credentials aren't configured.
- `tests/1_2_google-sheets-sync/integration/delete-physical.test.mjs` and
  `worker-order.test.mjs` never call the real Google API — they use an
  in-memory `FakeGoogleSheetsClient`
  (`tests/support/google-sheets/fake-sheets.mjs`) against a real local
  MongoDB outbox collection, deliberately with `DBA_PRIMARY_BACKEND=mongo`
  even though the local stack's real primary is Postgres — this avoids
  racing a live dashboard container's real background Google Sheets worker
  for the same shared Postgres outbox table (see those files' own header
  comments for the full rationale). They skip (never fail) when no local
  MongoDB is reachable.

## Read-only vs data-mutating tests

Any test that mutates a real, shared environment (QNAP TEST's real Mongo,
Postgres, or Google Sheets) is gated behind an explicit env var
(`E2E_TEST3_PASSWORD`, `E2E_LOGIN_PASSWORD`, `GOOGLE_SERVICE_ACCOUNT_*`) and
`describe.skipIf`/`it.skipIf`, and is scoped to synthetic data or test3's own
isolated repoGuid — never pawel_f/kamil_s. Reconciliation-style checks
against pawel_f/kamil_s must only ever **read**, never mutate.

## Commands

```bash
pnpm test:regression:data-protection     # 1_1_data-protection
pnpm test:regression:google-sheets       # 1_2_google-sheets-sync
pnpm test:regression:history             # 1_3_history-integrity
pnpm test:regression:tables-release      # 1_4_tables-release (Daily/Dates/Leads)
pnpm test:regression:release-audit       # all four pillars — ALWAYS runs every one (tests/support/run-full-release-audit.mjs), even if an earlier pillar fails, so a full audit never silently skips a pillar
```

**All four pillars are mandatory before a release-readiness verdict** — no
`1_*` pillar is optional. `test:regression:release-audit` never short-
circuits: it always runs 1_1, 1_2, 1_3, and 1_4, then exits non-zero if any
of them failed, printing a PASS/FAIL summary per pillar. READY FOR BOSS
requires all four to report PASS, plus a completed read-only reconciliation
of real users (pawel_f, kamil_s) against Google Sheets — see
`tests/1_2_google-sheets-sync/integration/reconcile-real-users.test.mjs`
and `tests/release-audit-report.md` for the current result.

Compatibility aliases (preserved from before the reorg, paths updated):

```bash
pnpm test:tables-sync              # node:test files across google-sheets/daily/dates/history
pnpm test:tables-sync:local
pnpm test:tables-sync:qnap-test
pnpm test:backend-config:no-chad-mongo
pnpm test:offline-readonly-backup
```

See individual `test:unit:*` / `test:integration:*` / `test:e2e:*` scripts in
the root `package.json` for the narrower, single-file commands these
regression scripts compose.

## PASS / FAIL / SKIPPED / BLOCKED

- **FAIL** always produces a non-zero exit code — no exceptions.
- **SKIPPED** (env var missing, resource unreachable) is never reported as
  PASS — it is a distinct, visible state that must be called out by name in
  any audit report, never silently folded into a green result.
- **BLOCKED** means the test could not even run (missing infra, no
  credentials available in this environment) — also never reported as PASS.

## Adding a new test

Pick the pillar matching the test's actual purpose (not its filename) —
if it's genuinely cross-cutting, assign it to the one pillar it most
directly protects rather than splitting it. Put shared helpers/fixtures
under `tests/support/{database,users,google-sheets,assertions,fixtures}/`,
never duplicate them per-pillar.
