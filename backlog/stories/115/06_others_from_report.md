# Story 115 — Others

## `cp-import.test.ts` could not be run locally (pre-existing, unrelated)

`packages/dba/src/cp-import.test.ts` sets `process.env.POSTGRES_URI` to a
local throwaway Postgres (`localhost:5433/chad_test_story109_import`,
matching this repo's local-mac-docker Postgres container). In practice the
actual connection is built by `postgres.ts`'s `getPostgresUri()` →
`dev-db-override.ts`'s `getEffectivePostgresUri()`, which — unless the
Dev-Panel-style source override has been switched — always builds a URI
for the **real QNAP server** (`buildPostgresUriForSource("server")`),
ignoring `process.env.POSTGRES_URI` entirely unless it already looks like
a QNAP URI. Running the test attempted to authenticate to the real QNAP
Postgres using the local container's password and failed
(`password authentication failed for user "chad"`) — as expected once the
mechanism is understood, not a credentials typo. Confirmed the local
Postgres container's own credentials ARE correct (direct `psql` from
inside the container worked fine against both the `chad` and
`chad_test_story109_import` databases) — the gap is purely in how the test
bootstraps its DB target relative to `dev-db-override.ts`'s default.

This isn't something introduced by this Story — `leads-postgres.test.ts`
uses the exact same bootstrap pattern and would hit the same issue. Neither
test is part of the project's own `test:integration:local-postgres` script
(root `package.json`), so this may be a known/accepted gap already, or
these tests may only ever have been run in a differently-configured
environment (CI, or a session with a Dev Panel override already active).
Not fixed here — flagging for whoever owns Postgres test infra next.

**Compensating verification actually performed:** a full live end-to-end
reproduction of the exact bug via Playwright against the real running app
(see `05_tasks_and_checklist.md`) — arguably stronger evidence for this
specific fix than the unit test would have been, since it exercises the
real route, real session, real Postgres (QNAP), and the real UI.

## Docker build cache (same caveat as Story 114)

Rebuilt with `docker compose build --no-cache` directly, per the pattern
already established and documented in Story 114's
`06_others_from_report.md` — a normal cached build was observed there to
silently serve stale code. Not re-diagnosed here, same workaround applied.
