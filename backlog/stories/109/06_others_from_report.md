# Story 109 — Others (decisions, limitations, follow-ups)

## Architectural decision (confirmed with user mid-Story)

Initial framing treated "packages/dba" vs "packages/content-provider" as
alternative places to put the import logic. The user corrected this
explicitly (Input 2): they are layers, not alternatives —
`Dashboard → dba → content-provider (cp-entry → provider)`. Implemented
accordingly; see `ai-docs/content-provider/ai-start.md` for the durable
version of this rule so future agents don't re-ask.

## Real bug found and fixed via the local-Docker smoke test (not theoretical)

The first real browser smoke test (test3, local Docker) exposed an actual
data-isolation bug, not just a theoretical gap: `cp-postgre`'s connection
pool reads `CP_POSTGRE_URI ?? POSTGRES_URI` directly from env — in local
Docker that's the local mirror container — while `dba`'s own read path
(`dev-db-override.ts`) defaults to the real QNAP server. The very first
import committed successfully... into the local mirror, completely
invisible to the normal Folders GET route (which reads QNAP). No real data
was harmed (QNAP's actual `views`/`leads`/etc. were never touched — the
write landed in an unrelated, mostly-empty local database), but the
feature was silently non-functional in the environment it was just tested
in.

**Fixed**: added `packages/content-provider/entry/src/postgre-connection.ts`
(`ensurePostgreConnectionUri`) — `cp-import.ts` now calls
`getEffectivePostgresUri()` (dba's own authoritative "which Postgres is
currently active" resolver) and hands that exact URI to cp-entry/cp-postgre
before every import, closing and letting cp-postgre's pool lazily
reconnect if the effective URI changed. DBA still owns resolving "which
environment"; cp-postgre still owns "how to execute against it" — no new
`cp-postgre → dba` dependency. Re-verified after the fix: `git log`/psql
against the local mirror confirms only the fixed-up rows during testing;
see the Story's checklist for the final passing smoke test.

**Still an open, smaller residual gap**: `ensurePostgreConnectionUri`
handles the "URI resolved once per import call" case correctly, but
`cp-postgre`'s pool is otherwise a plain, non-override-aware singleton — if
some *other*, future caller ever uses `cp-postgre`/`cp-entry` directly for
reads outside this one DBA-mediated import path, it would need the same
treatment. Not a concern today (import is the only real cp-entry consumer),
worth remembering if that changes.

## Other known, pre-existing environment gaps touched by this Story

1. **Several existing `*-postgres.test.ts` integration tests
   (`leads-postgres.test.ts`, `mutate-postgres.test.ts`,
   `postgres-cp-provider.test.ts`, `data-outbox-postgres.test.ts`,
   `msg-workout-cp.test.ts`) cannot run in a sandboxed session without
   real QNAP/Tailscale credentials** — confirmed independently of this
   Story (`leads-postgres.test.ts` fails identically in isolation, never
   touched by this Story). `packages/dba/src/dev-db-override.ts`'s
   "server" Postgres source always builds a QNAP Tailscale URI unless the
   env `POSTGRES_URI` itself already looks like a QNAP URI — by design
   (`ai-docs/databases/red-rules.md` Rule 1: "This must always be an
   explicitly selected mode, never a silent fallback"). This Story's own
   `packages/dba/src/cp-import.test.ts` has the exact same limitation
   (it exercises `resolveLogicalNamePath`, which goes through this same
   blocked path) — real coverage of the equivalent logic was added one
   layer down instead, at `packages/content-provider/postgre/src/import/commit-import.test.ts`,
   which connects directly (bypassing `dev-db-override.ts`, same as
   `cp-postgre`'s own client always has) and passes against the local
   Docker Postgres. `cp-import.test.ts` itself would pass on a machine
   with real QNAP/Tailscale access (same as the pre-existing tests it's
   modeled on) — it wasn't possible to verify that in this session.
2. **Host-side scripts that call `pnpm --filter dba build` directly**
   (`bash-scripts/dashboard/03_local_mac_docker/03_re-start.sh` line ~88,
   for the Postgres migration helper; `07_sync-postgres-from-qnap.sh`;
   `02_local_mac_tmux/02_build.sh`/`03_re-start.sh`; the two
   `00_qnap_shared/09_story81_remote_*` scripts) now implicitly require
   `cp-entry` (and its own deps: `cp-core`/`cp-files`/`cp-mongo`/
   `cp-postgre`/`cp-net-adapter`) to already be built on that host —
   `dba`'s `tsc` won't resolve `cp-entry`'s types otherwise. Only the
   Dashboard's actual Docker image build
   (`packages/dashboard/Dockerfile`) was fixed with an explicit build-order
   change; the host scripts above were left as-is (they already assume a
   set-up dev environment, e.g. `pnpm install` already run) rather than
   editing every one of them. A first `pnpm --filter cp-core build && ...
   && pnpm --filter cp-entry build` on a fresh checkout satisfies this for
   all of them going forward. Flagged here as a real, minor follow-up
   rather than silently left undiscoverable.

## Deliberately not done (see 02_plan.md §7 "Out of scope")

- `folders.ts`'s existing read/write helpers were not migrated to route
  through `cp-entry` — only the new import feature uses the new layering.
  Existing DBA→postgres-cp-provider shortcuts remain as accepted,
  transitional debt.
- `cp-postgre`'s `GetByNames`/`GetManyByName`/`Put`/`PostParentItem` were
  not implemented — the import feature only needed `GetItem` (already
  working) plus the new standalone `commitFolderImportPostgre`.
- Folders GUI was not rebuilt beyond the one Import button in the existing
  Folder action row.
