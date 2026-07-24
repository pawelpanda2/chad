# Story 81 — Others

## Architectural decisions

- **TEST's Postgres cutover env values are hardcoded literals in
  `docker-compose.qnap.test.yml`, never `${DBA_PRIMARY_BACKEND:-mongo}`
  read from the shared `.env.qnap`.** Both TEST's and PROD's compose files
  read that exact var name from the exact same file
  (`ENV_FILE=$REPO_ROOT/.env.qnap` for both) — a plain default-value entry
  in the shared file would silently apply to PROD too, the next time
  anyone restarts/redeploys it. `POSTGRES_USER`/`POSTGRES_PASSWORD`/
  `POSTGRES_DB` ARE added to the shared `.env.qnap` (consumed by the
  `postgres` service itself), but that's safe: `docker-compose.qnap.prod.yml`
  never references those var names at all, so their presence has zero
  effect on PROD's interpolation.
- **`DBA_POSTGRES_REPO_ALLOWLIST`, not a separate Postgres database/schema
  per environment.** QNAP's Postgres is one shared instance (matching
  Mongo's own shared-between-TEST-and-PROD topology, per the user's
  explicit direction during Story 80). Since only `test3`'s data is
  migrated into it for now, the risk is a non-`test3` write on TEST
  silently creating a new, wrong "island" of data. A repo-scoped guard
  inside `PostgresCpProvider` (new in this Story) is simpler and more
  robust than trying to enforce this at the network/infra level, and it's
  naturally a no-op once (in a future Story) every real repo has been
  migrated and the env var is simply unset.

## Problems encountered

- **QNAP was 3 Stories behind `main`** (Story 78, not Story 79/80) —
  neither TEST nor PROD had any of the code this Story's input assumed
  was already deployed. Confirmed with the user before proceeding;
  documented in `01_input.md`'s Input 2 and `02_plan.md`.
- **A real bug in Story 79's `ensureCpHistoryIndexes()`** was only
  discoverable against QNAP's real, years-accumulated Mongo data — a plain
  unique index on `{sourceId,version}` collided with pre-Story-79 legacy
  `cp_history` documents (which have no `version` field), breaking
  `cp_history` writes for the whole database, not just one repo. Fixed
  with a partial index (`partialFilterExpression: {version:{$exists:true}}`).
  This is exactly the kind of gap Story 79's own checklist had flagged as
  a real risk by explicitly marking "QNAP TEST deployment... NOT DONE" —
  now closed.
- **A parallel session was actively editing `packages/dba/src/index.ts`
  and `vitest.config.mjs`** (Story 82, folders write path) at the same
  time this Story needed to commit changes to those same files. Resolved
  by staging exact intended blob content directly into git's index
  (`git hash-object`/`git update-index --cacheinfo`) rather than editing
  the working tree files (which kept getting the other session's lines
  re-applied mid-edit) — their in-progress, uncommitted work was never
  touched or lost.
- **GHCR image builds via `docker build --platform linux/amd64` on Apple
  Silicon take several minutes under QEMU emulation** — ran in the
  background (harness-tracked), which is the correct pattern; manually
  `kill`/`pkill`-ing a stray duplicate accidentally also interrupted the
  harness-tracked job once, requiring a clean retry. No QNAP-side impact
  either time (confirmed via read-only `docker inspect` that TEST stayed
  on its prior working image throughout).

## Known limitations / explicitly not done

(filled in as the remaining Postgres-cutover steps complete — see
`05_tasks_and_checklist.md`)

## Follow-up proposals

- The pre-Story-79 legacy `cp_history` documents still physically exist in
  QNAP's Mongo (58 documents as of this Story) — harmless (excluded from
  the new unique index by the partial-filter fix) but could be archived/
  removed in a future cleanup Story once nobody needs them for reference.
- `chad-history-worker` is still running on QNAP (needed for as long as
  PROD stays on pre-Story-79 code) — removing it is contingent on PROD's
  own eventual Story 79+ upgrade, out of this Story's scope (PROD is
  explicitly untouched here).
