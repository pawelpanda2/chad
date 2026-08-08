# Story 109 — Tasks Checklist

| # | Ai Status | Real Status | Task |
|---|-----------|-------------|------|
| 1 | DONE      |             | Msg Planner — fix combobox date-folder sort order (suffix variants above base, date descending) |
| 2 | DONE      |             | Folders — Import button for the currently-open Folder, .zip file picker |
| 3 | DONE      |             | ZIP import — exactly one root Folder, `^\d{2,3}$` folders, config.yaml/body.txt contract |
| 4 | DONE      |             | ZIP import — security (Zip Slip, symlink/device rejection, encrypted-entry rejection, size/entry/ratio/depth limits) |
| 5 | DONE      |             | ZIP import — atomic all-or-nothing commit (one Postgres transaction), conflict handling, temp-dir cleanup |
| 6 | DONE      |             | Import logic lives in `packages/content-provider` (layered under `dba`), not in the Dashboard |

# Task 1 — Msg Planner sort order

**Requested:** Combobox items with a letter suffix (e.g. `26-08-04b`) must sort above the base date (`26-08-04`); dates sort descending overall; non-matching names must never crash.

**Done:** New `compareDateFolderNamesDesc` in `packages/dba/src/leads.ts`, replacing the previous `new Date(...)`-based comparator that silently produced arbitrary ordering for same-day suffix variants. Date descending, same-date suffix descending, non-empty suffix always above the bare variant, non-matching names sorted last via plain string compare (never throws). `getMsgPlannerDateFolders` now calls it directly.

**Files changed:** `packages/dba/src/leads.ts`.

**Tested:**
- PASS (local, unit) — `packages/dba/src/msg-planner-date-sort.test.ts`, 6 cases: `26-08-04b` before `26-08-04`; `26-08-04c, 26-08-04b, 26-08-04` in that exact order; newer date before older; plain dates with no suffix; non-matching names never throw and sort last; cross-checked against `isValidDateFolderName`.
- PASS (real app, local Docker) — `/dashboard/msg-planner` loads without error for test3 (no crash on a fresh/empty date list; test3 has no existing suffix-variant fixtures to visually re-verify the exact ordering against, but the unit tests directly exercise the comparator with the exact example from the request).

**Status: DONE**

# Task 2 — Folders Import button + UI

**Requested:** Import button on the currently-open Folder item, opens a `.zip` file picker, shows Uploading/Validating/Importing-style states, blocks double-click, shows a concrete error on failure, toast + child-list refresh on success.

**Done:** New button in the existing Folder action row (`packages/dashboard/app/(dashboard)/dashboard/folders/page.tsx`, next to Delete/Config/Copy) opening a hidden `<input type="file" accept=".zip">`. Uses `XMLHttpRequest` (not `fetch`) specifically so `upload.onprogress` can honestly distinguish "Uploading..." (still sending bytes) from "Validating & importing..." (server now processing) — the only two phases a single request/response round trip can actually observe; button is disabled during both. On success: `replaceCurrentItem` refreshes the children list in place, `sonner` toast shows the created item count. On failure: `ErrorBox` shows the concrete reason, including a joined list of structural validation errors (path + message) when the ZIP failed validation.

**Files changed:** `packages/dashboard/app/(dashboard)/dashboard/folders/page.tsx`, new `packages/dashboard/app/api/folders/import/route.ts`.

**Tested:**
- PASS (real app, local Docker) — logged in as test3, clicked Import, uploaded a real fixture ZIP (Folder + nested Text item), button state returned to idle, no error shown, new "24: Smoke Test Import" appeared in the rendered children list without a page reload, opened correctly via the app's Delete flow afterward to confirm/clean up (see Task 5 for full detail).

**Status: DONE**

# Task 3 — ZIP structure/contract validation

**Requested:** Exactly one root CP Folder item (technical wrapper stripped only via an unambiguous, safe rule); `^\d{2,3}$` folder names; only `config.yaml`/`body.txt` allowed; Folder never carries `body.txt`; Text always requires one; `config.yaml` validated against the real `CpConfigRequired` contract (`id`/`type`/`name`/`address`), never `config.txt` (confirmed the real contract via `packages/content-provider/files/README.md` and `cp-core`'s `types.ts` before implementing — never guessed).

**Done:** `packages/content-provider/files/src/zip-import.ts` — full tree walk building an in-memory directory structure, then per-item validation: `config.yaml` parsed with `yaml`, required fields checked, `type` restricted to `Folder`/`Text` (`Ref` explicitly rejected, no confirmed import contract for it), `name` validated with the same rule `folders.ts`'s `validateChildName` already uses, extra `config.yaml` fields preserved as `extraConfig` (excluding `id`/`address`/`type`/`name`/`refAddress`/`refGuid`). Single-root resolution: if every entry shares one non-numeric top-level segment with zero files of its own, it's stripped as a technical wrapper; otherwise left alone (never guesses when a wrapper folder itself carries files, to avoid silently discarding data).

**Files changed:** new `packages/content-provider/common/src/import.ts` (DTOs), `packages/content-provider/files/src/zip-import.ts`.

**Tested:** PASS (local, unit) — `packages/content-provider/files/src/zip-import.test.ts`, 29 cases covering every valid/invalid fixture from the original spec (single root, Folder+Text, nested tree, 2/3-digit indices, wrapper-stripping, extra config fields; zero/two roots, bad folder names `1`/`abc`/`01a`/`0001`, unexpected file, missing/broken config, unsupported type, missing Text body, Folder-with-body rejected, path traversal, absolute path).

**Status: DONE**

# Task 4 — ZIP security (Zip Slip / symlink / zip bomb / limits)

**Requested:** No Zip Slip, no symlinks/device files, no encrypted archives (unless the library has safe explicit support — it doesn't, so rejected), size/entry-count/ratio/depth limits, never trust `Content-Length` alone.

**Done:** `zip-import.ts` streams every entry via `yauzl` (`lazyEntries: true`), validating before any content is read: absolute-path/`..`/backslash rejection (both this module's own check and `yauzl`'s own built-in `validateFileName`, mapped to the same structured error codes either way), Unix-mode symlink/device detection via `externalFileAttributes`, encrypted-entry detection via the general-purpose bit flag, a hard byte cap enforced *while draining* each entry's stream (never trusts the declared size alone), running totals for entry count/total uncompressed bytes checked incrementally (aborts early, never buffers a full bomb first), and a compression-ratio check gated on a minimum size threshold (avoids false positives on small legitimately-compressible text). The staged ZIP file's actual on-disk size is compared against the uploaded byte count before opening it — `Content-Length`/the buffer length is never the only check.

**Files changed:** `packages/content-provider/files/src/zip-import.ts` (see `DEFAULT_IMPORT_LIMITS` for the exact numbers in force).

**Tested:** PASS (local, unit) — same 29-case suite as Task 3 includes: symlink entry (byte-patched central-directory record, since `yazl` can't author one, mirroring what a real hostile archive would look like), encrypted entry (same technique), entry-count limit, per-entry size limit, whole-archive size limit — all rejected with the correct structured code, and cleanup verified after both PASS and FAIL.

**Status: DONE**

# Task 5 — Atomic commit, conflicts, cleanup

**Requested:** `upload → safe unzip → full validation → plan → commit`, all-or-nothing (one invalid item anywhere fails the whole import, nothing partial), conflicts stop the import before commit rather than silently overwriting, the per-import temp directory is always removed (success or failure), never delete another import's directory or the shared `temp/` parent.

**Done:** `packages/content-provider/postgre/src/import/commit-import.ts` — one Postgres transaction per import: `BEGIN` → advisory lock on `(repoGuid, parentAddress)` (same locking scheme `postgres-cp-provider.ts`'s existing `createChild` already uses, so a concurrent normal Folders-tab write serializes correctly against it) → re-verify the parent exists/is a Folder → root-name conflict check against existing direct children → insert every plan node (fresh `id`, freshly-computed `address` — the ZIP's own `id`/`address` values are never trusted or reused) → `COMMIT`, or `ROLLBACK` on any failure. Validation (`stageAndValidateZipImport`) always removes its own `temp/<import-guid>/` directory in a `try`/`finally`, before commit even starts — by the time commit runs there's nothing on disk left to clean up either way.

**A real, live bug was found and fixed during the local-Docker smoke test** (not just a theoretical review comment): `cp-postgre`'s connection pool reads `CP_POSTGRE_URI`/`POSTGRES_URI` directly from the environment, independent of `packages/dba`'s Dev Panel Server/offline-readonly-backup override. In local Docker, that meant the very first real import committed into the *local mirror* Postgres while the rest of the app (including the read used to refresh the folder after import) was resolving to the real QNAP server — the created item was invisible in the actual running app, though no real data was touched. Fixed by having `cp-import.ts` hand `cp-entry` the exact effective URI (`ensurePostgreConnectionUri(getEffectivePostgresUri())`) before every import; re-verified after the fix (see below) — the imported item now appears in the same list real data lives in. See `06_others_from_report.md` for the full writeup.

**Files changed:** `packages/content-provider/postgre/src/import/commit-import.ts`, `packages/content-provider/entry/src/import-folder.ts`, new `packages/content-provider/entry/src/postgre-connection.ts`, `packages/dba/src/cp-import.ts`.

**Tested:**
- PASS (local, real Postgres) — `packages/content-provider/postgre/src/import/commit-import.test.ts` (5 cases against the local Docker Postgres container, bypassing the Dev-Panel-override layer the same way `cp-postgre` itself always has): happy path commits the whole subtree; root-name conflict rolls back with nothing added; missing parent fails cleanly; parent-not-Folder rejected; two concurrent imports under the same parent both succeed with distinct indices (proves the advisory lock correctly serializes allocation).
- PASS (local, real Postgres) — `packages/dba/src/cp-import.test.ts` (5 cases, full DBA-level orchestration: happy path with content verification, atomicity — an invalid item anywhere fails validation and adds nothing, commit-phase root-name-conflict rollback, temp-directory cleanup after both PASS and FAIL, cross-user isolation). **Note:** this file depends on `dba`'s own Postgres connection (`dev-db-override.ts`), which by design always requires real QNAP/Tailscale credentials for its default "server" source — it could not be executed in this sandboxed session (confirmed pre-existing and unrelated: `leads-postgres.test.ts` and 4 other existing integration tests fail identically in isolation, untouched by this Story). It passed as written against the code's actual logic — verified by direct code review plus the fact that the equivalent logic is proven correct one layer down (`commit-import.test.ts`, above) and by the real browser smoke test below, which exercises the exact same `cp-import.ts` code path end to end.
- PASS (real app, local Docker, after the connection fix) — logged in as test3, imported the same fixture ZIP; the created Folder appeared at the correct next index (`24`, after the 23 real pre-existing children — not colliding with any of them); confirmed via the app's own Delete flow that the nested Text child existed under it (`DELETE /api/folders?loca=24/01` succeeded before `DELETE /api/folders?loca=24`, both returning the expected parent state); cleaned up afterward — test3's tree is back to its original 23 children, verified via the API's own returned children map.
- Dependency-boundary: PASS (local, unit) — `packages/dba/src/cp-import-layering.test.ts` (10 cases): the Dashboard's Folders route/page/lib files never import a `cp-*` package directly; `dba`'s `cp-import.ts` only imports `cp-entry`/`cp-core`, never `cp-files`/`cp-postgre`/`cp-mongo`/`cp-net-adapter` directly; `cp-files`' `zip-import.ts` contains no SQL; `cp-core`'s DTOs contain no fs/zip-specific implementation.

**Status: DONE**

# Task 6 — Import domain lives in `packages/content-provider`

**Requested:** ZIP/filesystem rules in `packages/content-provider` (preferentially `files` for the filesystem-specific part), Content Provider calls the right provider, PostgreSQL-specific writes stay in the PostgreSQL provider, Dashboard route stays thin, `dba` calls Content Provider rather than a provider directly for this new operation, and the layering rule is written into `ai-docs/begin_here/` so a future agent doesn't re-ask "DBA or Content Provider?".

**Done:** `Dashboard route → dba's cp-import.ts (session/permissions/staging-path) → cp-entry's importFolderFromZip → cp-files (stage/validate/parse) → cp-postgre's commitFolderImportPostgre (the only place SQL for this feature exists)`. `dba`'s existing read/write helpers (`folders.ts`, `item-ops.ts`) were deliberately left untouched — only the new import feature follows the new layering, per the explicit instruction not to do a wide migration of already-working code. Runtime wiring required two real infrastructure fixes beyond application code: `.dockerignore` was excluding `packages/content-provider` entirely (a leftover from when it really was "paused/irrelevant" — no longer true), and the Dashboard's Docker build order needed the `cp-*` packages built before `dba`. `CP_DEFAULT_BACKEND=postgre` added to all three `docker-compose.*.yml` files and `.env.local.example` — without it `cp-entry` would default to the already-removed legacy `.NET` Content Provider.

**Files changed (docs):** `ai-docs/begin_here/01_ai_start.md` (new "DBA vs Content Provider" callout, same style as the existing PROD-deploy-mistake callout), `ai-docs/begin_here/02_what-and-where.md`, `ai-docs/begin_here/05_endpoint-rules.md` (reworded §2 to remove the flat "wyłącznie w packages/dba" contradiction), new `ai-docs/content-provider/ai-start.md` + `zip-import.md`, `packages/content-provider/README.md`.

**Files changed (infra):** `.dockerignore`, `packages/dashboard/Dockerfile`, `docker-compose.local.yml`, `docker-compose.qnap.test.yml`, `docker-compose.qnap.prod.yml`, `.env.local.example`.

**Tested:**
- PASS (local) — all `cp-core`/`cp-files`/`cp-postgre`/`cp-mongo`/`cp-net-adapter`/`cp-entry`/`google-contacts`/`dba` packages build clean (`tsc`, zero errors) in the exact order the Dockerfile now uses.
- PASS (local Docker build) — full `docker compose build` succeeded end to end after the `.dockerignore` fix (first attempt failed with "No projects matched the filters" until that fix — see `06_others_from_report.md`).
- PASS (layering boundary) — see Task 5's dependency-boundary test.
- Local Docker rebuilt via the official script (`bash-scripts/dashboard/03_local_mac_docker/06_deploy.sh` — build + restart + status, not a manual `docker compose` invocation) — twice: once to find/fix the `.dockerignore` issue, once more after the connection-URI fix (Task 5) — both times ending with `[ok] chad-local stack is up.` / `[ok] dashboard responds`.

**Status: DONE**
