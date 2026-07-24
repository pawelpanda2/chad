# Story 80 — Knowledge

- `packages/dba/src/cp-model.ts` — `CpItem`/`CpItemConfig` shape, `ADDRESS_PATTERN`,
  `splitAddress`, `formatChildIndex`/`nextChildIndexFromSiblings`,
  `validateCpItem` (`_id === config.id` invariant). Needed to keep the exact
  same contract in `PostgresCpProvider`.
- `packages/dba/src/data-providers/mongo-cp-provider.ts` — the provider being
  ported: method signatures, repo isolation (derived from `address`, no
  stored `repoGuid` column — Postgres schema adds an explicit indexed
  `repo_guid` column instead, a deliberate deviation for query performance),
  child address allocation (`reserveNextChildAddress`, two-step atomic
  `$setOnInsert`+`$inc` — ported to Postgres as an advisory-lock + direct
  insert, no counter table).
- `packages/dba/src/cp-history/mutate.ts` — `executeCpMutationWithHistory`,
  the Mongo transaction this Story replaces with a Postgres trigger;
  mutationId idempotency two-layer defense (fast-path `findOne` + slow-path
  duplicate-key catch) is the exact pattern to replicate against Postgres's
  `23505` unique-violation error code.
- `packages/dba/src/cp-history/{hash,diff}.ts` — DB-agnostic pure functions,
  reused unchanged for Postgres (`canonicalize`/`hashCpState`,
  `diffConfig`/`diffBody`).
- `packages/dba/src/data-outbox.ts` + `data-outbox-worker.ts`,
  `packages/dba/src/google-sheets/{outbox,worker,bootstrap}.ts` — Mongo
  outbox/worker pair being ported to Postgres `FOR UPDATE SKIP LOCKED`.
  Only the Google Sheets worker is actually wired into a running process
  (`packages/dashboard/instrumentation.ts`); the data-sync worker never is
  (pre-existing gap, out of scope here).
- `packages/dba/src/data-providers/config.ts` + `data-router.ts` +
  `data-router-instance.ts` — env-driven backend selection
  (`DBA_PRIMARY_BACKEND`, `DBA_MONGO_ENABLED`, etc.); `CpCompatibleDataProvider`
  interface every provider (including the new Postgres one) must implement.
- `packages/dba/src/repo-context.ts` — `AsyncLocalStorage`-based
  `tryGetCurrentActor()`/`tryGetCurrentRequestId()`, the source of the
  `app.actor_*`/`app.request_id` transaction-local settings.
- `packages/dba/src/cp-history.ts` — read side for Dashboard History UI;
  becomes a backend dispatcher in this Story.
- `packages/dashboard/app/api/content-provider/history/route.ts` +
  `.../history/[id]/route.ts` — repoGuid always from session
  (`getCurrentUserFromCookies()`), never client params; unchanged by this
  Story since they only call `cp-history.ts`'s public functions.
- `packages/dba/scripts/migrate-legacy-cp-items-to-history.mjs` +
  `cp-history-integrity-check.mjs` — script conventions (dry-run default,
  `--repoGuid` scoped, idempotent, run against built `dist/`, non-zero exit
  on inconsistency) replicated for the Mongo→Postgres migrator and the new
  Postgres integrity checker.
- `docker-compose.local.yml` / `docker-compose.qnap.{shared,test,prod}.yml`
  — service topology; `chad-mongodb`/`beeper-mongodb` physically split
  since Story 76; TEST and PROD dashboards share one `chad-mongodb`/
  `beeper-mongodb` ("TEST is not a sandbox" — `ai-docs/deploy/
  shared-qnap-services.md` §8); ports TEST=12020-29, PROD=12030-39,
  chad-mongodb=12040, beeper-mongodb=12041.
- `ai-docs/deploy/dashboard-deployment-scripts.md` — deploy script numbering
  contract, TEST-only build, promotion script requires typing `PROD`,
  `git_deploy_preflight` ignores submodule pointer drift on
  `net-content-provider` deliberately.
- `test/support/test3-guard.ts`, `test/support/provision-test3.mjs`,
  `test/e2e/playwright.config.mjs` — QNAP-TEST-only Playwright convention,
  `test3` fixture user, no real second fixture user (`test2`) exists yet —
  pre-existing gap noted in Story 78, still open, cross-user isolation
  tests remain synthetic-GUID-only in this Story too.
- No existing Postgres/`pg`/ORM usage anywhere in the repo before this
  Story — confirmed by exhaustive grep. `packages/dashboard/prisma/
  schema.prisma` is an unrelated legacy SQLite model (`Outing`/`Lead`/`User`),
  not touched by this Story.
