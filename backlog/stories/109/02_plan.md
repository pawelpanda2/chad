# Story 109 — Plan

Start SHA (return point): `d6da6aa` (baseline commit capturing pre-existing
uncommitted photos-gallery work, story 106/107, that predated this task).

## 1. Msg Planner sort — DONE

`packages/dba/src/leads.ts`: `compareDateFolderNamesDesc` (new, exported,
tested) replaces the broken `new Date(...)` comparator in
`getMsgPlannerDateFolders`. Date desc, same-date suffix desc, suffixed
above bare, non-matching names never throw (fall back to plain string
compare, always sorted last). Test:
`packages/dba/src/msg-planner-date-sort.test.ts` (6 cases, registered in
root `vitest.config.mjs`).

## 2. CP Folder ZIP import — architecture

Confirmed by direct code reading (not assumed):
- Dashboard depends only on `dba` (no `cp-*` package) — Folders tab today
  writes via `dba/src/folders.ts` → `item-ops.ts` → `data-router-instance`
  → `data-providers/postgres-cp-provider.ts`, straight to `cp_items`.
- `packages/content-provider` (`cp-core`/`cp-entry`/`cp-files`/`cp-mongo`/
  `cp-postgre`/`cp-net-adapter`) is real, buildable TypeScript but not
  wired into the Dashboard's Docker build at all today (Dockerfile only
  builds `google-contacts` + `dba` before `dashboard`). `cp-postgre` only
  implements `GetItem`; `GetByNames`/`GetManyByName`/`Put`/`PostParentItem`
  throw `notImplemented()`.
- User's explicit correction (Input 2): this is not "dba OR
  content-provider" — it's layered: **Dashboard → DBA → Content Provider
  (cp-entry → provider) → Postgres**. New code must follow this. Existing
  DBA→postgres-cp-provider shortcuts stay as-is (out of scope to migrate
  wholesale); only *new* code avoids adding to that debt where a working
  CP contract already exists.
- `cp_items` carries a DB-level trigger (`cp_items_write_history`, Story 80
  SQL migration) that writes `cp_history` automatically on any INSERT/
  UPDATE/DELETE, keyed off transaction-local `app.*` settings
  (`set_config`). Any new write path must set that context itself
  (duplicated as a small local SQL helper in the new `cp-postgre` code —
  cannot import `dba/src/postgres.ts`'s version, wrong dependency
  direction).
- `cp-postgre`'s own Postgres pool reads `CP_POSTGRE_URI ?? POSTGRES_URI`
  directly from env — it does **not** know about `dba`'s Dev Panel
  Server/offline-readonly-backup override (`dev-db-override.ts`). This is
  a **pre-existing gap** (already true of `cp-postgre`'s working `GetItem`
  today), not something this Story introduces. Mitigation: DBA calls
  `assertChadWriteAllowed()` (checks the Dev Panel state directly, not the
  pool) before delegating to Content Provider, so a write during
  offline-readonly-backup mode is still always blocked. The pool-level gap
  (whether `cp-postgre` connects to the *exact* currently-selected server
  when NOT in backup mode) is noted as a follow-up in
  `06_others_from_report.md`, not solved here — solving it properly means
  giving `cp-postgre` its own override-awareness, a cross-cutting change
  beyond this feature.
- `CP_DEFAULT_BACKEND` is never set in any real env file — `cp-entry`
  would default to `net-adapter` (a legacy .NET service that no longer
  exists in this repo, per `ai-docs/begin_here/02_what-and-where.md`'s
  "USUNIĘTE 2026-07-27" note). Fix: set `CP_DEFAULT_BACKEND=postgre`
  alongside `DBA_PRIMARY_BACKEND=postgres`/`DBA_POSTGRES_ENABLED=true` in
  `docker-compose.local.yml`, `docker-compose.qnap.test.yml`,
  `docker-compose.qnap.prod.yml`, and the `.env*.example` files — a small,
  necessary correction (per Input 2 §2), not a wider migration.

### Package boundaries (per Input 2 §3)

- **`cp-core`** (`packages/content-provider/common`): new pure DTOs only —
  `CpImportNode`, `CpImportPlan`, `CpImportValidationError`,
  `CpImportValidationResult`, `ImportFolderLimits`, `CpImportCommitResult`.
  No fs/zip/SQL.
- **`cp-files`** (`packages/content-provider/files`): new
  `zip-import.ts` — stages the uploaded ZIP bytes under a caller-given
  absolute directory (DBA resolves *which* directory; `cp-files` doesn't
  know about usernames/env), opens it with `yauzl`, walks entries with
  full safety checks (Zip Slip, symlink/device rejection, encrypted-entry
  rejection, size/count/ratio/depth limits), strips a single technical
  wrapper directory only if that still leaves exactly one root CP item,
  enforces the `^\d{2,3}$` folder rule and the `config.yaml`/`body.txt`
  file contract, parses `config.yaml` (`yaml` package, already a `cp-files`
  dependency) and validates required fields, and returns a
  `CpImportValidationResult` (never throws for a validation failure —
  returns structured `{code, path, message}[]`). Always removes the
  staging directory before returning (try/finally) — validation is
  fully self-contained; by the time a plan is returned, nothing is left on
  disk (satisfies "cleanup after PASS, validation FAIL, and commit FAIL"
  trivially for the FAIL cases and for PASS; commit itself never touches
  the filesystem, so there's nothing left to clean up after a commit
  failure either).
- **`cp-postgre`** (`packages/content-provider/postgre`): new
  `import/commit-import.ts` — `commitFolderImportPostgre(repoGuid,
  parentAddress, plan, actor)`. One Postgres transaction: `BEGIN` →
  advisory lock on `(repoGuid, parentAddress)` (same
  `pg_advisory_xact_lock(hashtextextended(...))` pattern as
  `postgres-cp-provider.ts`'s `createChild`) → re-verify parent exists/is
  Folder (`FOR UPDATE`) → root-name conflict check against existing direct
  children → DFS insert of every plan node (fresh `id`/`address` per node,
  never trusting the ZIP's own `id`/`address`; `set_config` mutation
  context per row so the existing `cp_items_write_history` trigger fires
  normally) → `COMMIT`, or `ROLLBACK` and a typed failure on *any* error
  (unique violation, conflict, parent gone, anything) — nothing partial.
  This is a **new, standalone function**, not an addition to the 6-method
  `ContentProviderStorage` contract (import is a CHAD-specific bulk
  operation, not part of the real external CP protocol those 6 methods
  mirror). Does not touch/complete `GetByNames`/`Put`/`PostParentItem` —
  out of scope, would be exactly the "broad migration" Input 2 forbids.
- **`cp-entry`**: new `importFolderFromZip(...)` — calls `cp-files`
  validation, then (only if `getBackendKindForRepo(repoGuid) === "postgre"`)
  `cp-postgre`'s commit function; throws a clear "backend not supported"
  error for any other backend (CHAD only runs Postgres in practice —
  `chad-mongodb` was fully removed 2026-07-27). Exported alongside `entry`.
- **`dba`** (new `packages/dba/src/cp-import.ts`, new dependency on
  `cp-entry`/`cp-core` in `package.json`): resolves session
  (`getCurrentUsername`/`getCurrentRepoGuid`), resolves the *target*
  parent Folder via `cp-entry`'s `entry.GetItem` (a working CP contract
  already — using DBA's own `getItemByAddress` here would be exactly the
  new shortcut Input 2 forbids), checks permissions
  (`assertChadWriteAllowed`, repo-allowlist guard, `assertNotSystemFolderWrite`
  via the existing `resolveLogicalNamePath`/`SYSTEM_FOLDERS` check — reused
  as-is, it's a generic read-only utility, not import-specific logic),
  resolves the per-user staging directory path (reusing
  `google-contact-photos.ts`'s `getContactPhotosRootDir`/
  `assertSafeUsername`/`assertSafeContactPhotoPath`, extended one level:
  `.../02_files_zip/temp/<importGuid>`), then calls `cp-entry`'s
  `importFolderFromZip`. Maps `CpImportValidationResult`/commit result to a
  small `CpImportError` DTO the Dashboard route can map to HTTP. Never
  contains ZIP parsing, config.yaml/body.txt rules, or SQL.
- **Dashboard**: new `POST /api/folders/import` route — session, multipart
  upload (`request.formData()`, `runtime = "nodejs"`, mirrors
  `app/api/leads/archives/route.ts`), basic file-presence/extension gate,
  `runWithRepoContext`, one call into `dba`'s new function, map
  `CpImportError` → HTTP status. New "Import" button in
  `folders/page.tsx`'s existing Folder action row (`page.tsx:779-828`,
  next to Delete/Config/Copy), `<input type="file" accept=".zip">`,
  Uploading/Validating/Importing states, disabled while in flight, error
  banner with the concrete reason, success toast + child-list refresh.

## 3. Conflict policy

Default: reject before commit if a direct child of the target parent
already has the imported root's name (matches "domyślnie konflikt ma
zatrzymać import przed commit" — no documented CP contract for a safer
alternative semantics was found, so the stop-by-default rule stands as
given). Nested-tree conflicts can't occur (the whole subtree is new
address space under the newly-allocated root).

## 4. Limits (zip bomb / DoS)

Mirrors existing conventions in this repo (`lead-archives.ts`'s 50MB/
`folders.ts`'s `buildFolderExport`'s 500-item cap) rather than inventing
new numbers from scratch: max ZIP size 50MB, max entries 2000, max total
uncompressed bytes 200MB, max single entry uncompressed bytes 10MB, max
compression ratio 100:1 (only checked once uncompressed size is already
"suspicious", >1MB, to avoid false positives on legitimately-compressible
small text), max tree depth 20, max item count 500 (same as folder
export). Encrypted entries and any non-regular-file entry (symlink,
device, FIFO) rejected outright.

## 5. Testing

- `cp-files` zip-import: fixtures built in-memory (no binary fixture
  files checked in — built with a zip-writing helper in the test itself)
  covering §5.2/5.3 of the original prompt (valid trees, zero/two roots,
  bad folder names, unexpected files, missing/broken config, unsupported
  type, missing body for Text, `../evil`, absolute path, symlink, zip
  bomb, too many entries, encrypted archive).
- `cp-postgre` commit: real local Postgres (same throwaway-repoGuid
  pattern as `leads-postgres.test.ts`) — happy path, root-name conflict,
  and an injected mid-tree failure proving rollback (nothing partial).
- `dba/cp-import.ts`: injectable-ops unit tests (permission/system-folder/
  staging-path plumbing) — no real Postgres needed, mirrors
  `folders.test.ts`'s fake-ops seam.
- Dependency-boundary check: a small static test asserting `dba`'s new
  file imports only from `cp-entry`/`cp-core` (never `cp-files`/
  `cp-postgre` directly) and that the Dashboard route imports only from
  `dba` (never any `cp-*` package) — grep-based, extending the existing
  convention rather than adding new tooling (no existing dependency-lint
  tool found in the repo).

## 6. Documentation

- `ai-docs/begin_here/01_ai_start.md`: new short callout (same style as
  the existing PROD-deploy-mistake callout) with the layering diagram —
  prevents the next agent re-asking "DBA or Content Provider?".
- `ai-docs/begin_here/05_endpoint-rules.md`: reword §2 to distinguish
  "DBA is the application/orchestration layer" from "CP domain rules for
  NEW backend-agnostic operations belong in `packages/content-provider`,
  called by DBA" — removes the flat contradiction with the new rule.
- `ai-docs/begin_here/02_what-and-where.md`: replace the dangling
  "Content Provider — adapter/model above" pointer with a real entry
  linking to a new `ai-docs/content-provider/ai-start.md`.
- New `ai-docs/content-provider/ai-start.md` + `zip-import.md` (the
  layering rule in depth, migration note about old shortcuts, and the
  full ZIP import contract: one root, `^\d{2,3}$`, config.yaml/body.txt,
  security, atomicity, conflicts, cleanup).
- `packages/content-provider/README.md`: add the layering note (callers
  never pick a backend; DBA delegates to `cp-entry`).

## 7. Out of scope / explicitly not doing

- Not migrating `folders.ts`'s existing read/write helpers to route
  through `cp-entry` — only the new import feature uses the new layering.
- Not implementing `cp-postgre`'s `GetByNames`/`GetManyByName`/`Put`/
  `PostParentItem` — the import feature doesn't need them.
- Not giving `cp-postgre` Dev-Panel-override awareness (see §2's noted
  follow-up).
- Not rebuilding the Folders GUI beyond the one Import button.
- Not touching PROD.
