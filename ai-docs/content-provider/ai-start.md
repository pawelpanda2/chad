# Content Provider — ai-start

Status: created 2026-08-08, Story 109. Read
[`ai-docs/begin_here/01_ai_start.md`](../begin_here/01_ai_start.md)'s "DBA
vs Content Provider" callout first — this file is the fuller version of
that same rule, not a separate one.

## The layering, restated

```
Dashboard / API route / Console
        ↓
    packages/dba          — session/repo context, permissions, CHAD application orchestration
        ↓
packages/content-provider — CP domain rules (contracts, validation, import), backend-independent
        ↓
      cp-entry             — picks the backend (postgre is the only real one today)
        ↓
    provider (postgre / files / mongo / net-adapter) — physical write/read
```

`packages/dba` and `packages/content-provider` are **not** alternative
places to put the same logic. DBA is the layer *above* Content Provider,
not a competing implementation of it. Concretely:

- **DBA owns**: `runWithRepoContext`/`getCurrentRepoGuid`/
  `getCurrentUsername`, permission checks (`assertChadWriteAllowed`,
  system-folder read-only guard, repo allowlist guard, admin unlock),
  mapping domain errors to whatever shape the Dashboard route expects.
  Nothing here should re-implement CP's own structural rules (numeric
  folder names, `config.yaml`/`body.txt` contract, address format).
- **Content Provider owns**: the `CpItem`/`CpConfig` contract (`cp-core`),
  validation of a CP tree's shape, backend-independent business rules for
  new bulk/domain operations (e.g. the ZIP import — see `zip-import.md`).
  Never touches session/permissions — a Content Provider function is only
  ever handed an already-authorized, already-resolved `repoGuid`/address by
  its DBA caller.
- **`cp-entry` owns**: choosing which physical `provider` backend serves a
  given `repoGuid` (config-only — `CP_DEFAULT_BACKEND`/
  `CP_REPO_BACKEND_OVERRIDES`). Callers (DBA, or anything else) never
  import `cp-files`/`cp-postgre`/`cp-mongo`/`cp-net-adapter` directly —
  always `cp-entry`.
- **A provider owns**: the actual physical read/write (SQL for `cp-postgre`,
  filesystem for `cp-files`, ...). SQL never appears outside a provider
  package.

## Current migration state — read before assuming "the rule is broken"

Most of `packages/dba`'s existing CP-reading/writing code (`folders.ts`,
`item-ops.ts`, `leads.ts`, ...) calls
`data-providers/postgres-cp-provider.ts` **directly**, skipping
`packages/content-provider` entirely. This predates the layering rule
above and is **known, accepted migration debt** — not a second, competing
pattern to copy. Two consequences:

1. If you're touching one of those existing call sites for an unrelated
   bug fix, you do **not** need to reroute it through `cp-entry` as part
   of that fix — that would be an unrequested, risky refactor of
   well-tested code. Leave it as-is unless the task specifically calls for
   migrating it.
2. If you're writing **new** code that needs a CP domain operation
   `cp-entry`/the relevant provider already implements correctly (e.g.
   `GetItem` — implemented in `cp-postgre` today), route the new code
   through `cp-entry`, not through a new direct call into
   `postgres-cp-provider.ts`. If the operation you need doesn't exist yet
   in Content Provider, add a small, focused contract for it there — don't
   reach around the layer just because it's faster in the moment.

`cp-postgre` today only implements `GetItem`; `GetByNames`/
`GetManyByName`/`Put`/`PostParentItem` throw `notImplemented()`. Do not
assume they work — check `packages/content-provider/postgre/src/provider/storage.ts`
before relying on any of them.

## Runtime wiring specifics (read before assuming this "just works")

- `CP_DEFAULT_BACKEND` must be `postgre` for `cp-entry` to route to
  `cp-postgre` — set explicitly in `docker-compose.local.yml`/
  `docker-compose.qnap.test.yml`/`docker-compose.qnap.prod.yml` (Story
  109). Without it, `cp-entry` defaults to `net-adapter`, which points at
  the legacy .NET Content Provider service — **removed from this repo**
  2026-07-27 (see `02_what-and-where.md`'s Content Provider section) — so
  an unset `CP_DEFAULT_BACKEND` is a hard failure, not a silent fallback
  to something that still works.
- The Dashboard's Docker build (`packages/dashboard/Dockerfile`) must
  build `cp-core`/`cp-files`/`cp-postgre`/`cp-mongo`/`cp-net-adapter`/
  `cp-entry` **before** `dba`, the same way it already builds
  `google-contacts` before `dba` — `dba`'s own `package.json` needs a
  `"cp-entry": "workspace:*"` dependency for any of this to resolve at
  all. If you add a new DBA→ContentProvider call site and the Docker
  build starts failing on `dba`'s `tsc`, check this build order first.
- `cp-postgre`'s own Postgres connection pool (`postgre/src/client.ts`)
  reads `CP_POSTGRE_URI ?? POSTGRES_URI` directly from the environment — it
  does **not** independently know about `packages/dba`'s Dev Panel Server/
  offline-readonly-backup override (`dba/src/dev-db-override.ts`). A real
  local-Docker smoke test caught this live (Story 109): the first ZIP
  import committed successfully into the *local mirror* Postgres, while
  every normal Folders read was resolving to the real QNAP server — the
  import was silently invisible, not corrupting anything but not working
  either. **Fixed**: `cp-import.ts` now calls `entry`'s
  `ensurePostgreConnectionUri(getEffectivePostgresUri())`
  (`entry/src/postgre-connection.ts`) before every import — DBA hands
  down the URI it already knows is currently effective, cp-postgre's pool
  closes/reconnects if it changed. `assertChadWriteAllowed()` is still
  called first too (blocks writes during offline-readonly-backup mode
  regardless of which pool a query would run against). This pattern
  (DBA resolves "which environment", hands the resolved value to
  cp-entry) is the one to follow for any *other* future write path through
  `cp-entry` — don't assume a provider's own env-var read is enough by
  itself.

## Where to look next

- [`zip-import.md`](zip-import.md) — the Folder-from-ZIP import feature's
  full contract (this is currently the only real consumer of the
  DBA→Content-Provider→cp-entry→provider path for a *write*).
- `packages/content-provider/README.md` — package layout/build/backend
  selection (technical, not AI-reading-order oriented — read this file
  first).
- `packages/dba/src/cp-import.ts` — the one DBA file that calls into
  Content Provider today; a template for the next one.
