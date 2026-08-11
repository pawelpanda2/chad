# ZIP import — Folder CP Item into the Folders GUI

Status: created 2026-08-08, Story 109. Read
[`ai-start.md`](ai-start.md) first for the layering this feature follows.

## What this is

The Dashboard's Folders tab lets a user import one Folder CP Item (and its
whole subtree) from an uploaded `.zip`, adding it as a new child of the
currently-open Folder. Entry point: `POST /api/folders/import`
(Dashboard) → `packages/dba/src/cp-import.ts` → `cp-entry`'s
`importFolderFromZip` → `cp-files` (stage/validate/parse) → (on success)
`cp-postgre`'s `commitFolderImportPostgre` (one transaction).

## Archive contract

- Exactly **one root CP item** at the first logical level of the archive.
  Two sibling top-level items is a hard failure (`MULTIPLE_ROOT_ITEMS`),
  zero is a hard failure (`NO_ROOT_ITEM`).
- **One safe exception**: if every single entry in the archive shares the
  same first path segment, and that segment does **not** itself match
  `^\d{2,3}$` (i.e. it can't already be a real CP item folder), it's
  treated as an archiver-added technical wrapper directory (e.g. some ZIP
  tools wrap everything in a folder named after the archive) and stripped
  before further validation. If the sole top-level segment already looks
  like a real CP folder name (e.g. `01`), it is **never** stripped —
  there's no way to distinguish "this is the wrapper" from "this is
  already the real root" in that case, so the safe default is to treat it
  as the real root.
- Every CP item's physical folder name matches `^\d{2,3}$` (2 or 3 digits
  — `01`, `02`, `10`, `99`, `100`, `102`). `1`, `abc`, `01a`, `0001` are all
  rejected (`INVALID_CHILD_FOLDER_NAME`).
- Each item folder contains exactly:
  - `config.yaml` — **required**, every item (Folder and Text).
  - `body.txt` — **required for `type: Text`**, **forbidden for
    `type: Folder`** (a Folder's real "body" in this system is a computed
    children map, never stored content — see `packages/dba/src/folders.ts`'s
    doc comment on `updateFolderTextBodyInternal`; a `body.txt` sitting
    next to `config.yaml` with `type: Folder` is rejected as
    `UNEXPECTED_FILE`, not silently ignored).
  - any number of further **numeric** subfolders (children), each
    following this same contract recursively.
  - anything else (a stray file, a non-numeric subfolder) is rejected as
    `UNEXPECTED_FILE`/`INVALID_CHILD_FOLDER_NAME`.

## `config.yaml` validation

Every `config.yaml` is parsed (`yaml` package) and checked against `id`/
`type`/`name` (all required, non-empty strings):

- `type` must be `"Folder"` or `"Text"` — **or `"Ref"`, if the caller has
  explicitly opted into skipping it** (see "Skippable issues" below).
  Without that opt-in, `Ref` is a hard failure — there is no confirmed
  contract for actually importing a `Ref` item as one.
- `name` only needs to be non-empty (after trim). It deliberately does
  **NOT** forbid `/`, `\`, or `".."` (unlike `folders.ts`'s
  `validateChildName`, used by the separate manual "Add" flow) — real
  exports use names like `"pomysły / todo"` and titles ending with `".."`;
  the live system never enforced those restrictions on `name`. `name` is a
  display label only, never used to build a path — CP addresses are always
  purely numeric segments. Zip Slip still rejects `".."` in ZIP *entry
  paths*, which is a separate check.
- **`id`/`address` are NOT required.** Their values are never trusted or
  reused regardless (every imported item gets a freshly generated `id` at
  commit time, and its `address` is always computed from where it
  actually lands in the target repo, never read from the ZIP — this is
  what makes "the ZIP can't point at another user's repo" true by
  construction). Requiring their mere presence was also found to be too
  strict: real on-disk `config.yaml` commonly omits `address` — the real
  system self-heals it on read (`MigrationWorker.TryMigrateConfig`), which
  a raw filesystem export never goes through (same reasoning `cp-files`'
  own normal-read `config.ts` already applied, independently, before this
  feature existed).
- Any other key in `config.yaml` (CP's own config is an open dict, see
  `cp-core`'s `types.ts`) passes through as an opaque extra field, **except**
  `id`, `address`, `type`, `name` (handled specially above) and
  `refAddress`/`refGuid` (rejected outright — no `Ref` support).

## Skippable issues (opt-in only, never the default)

Two specific, common real-world cases can be skipped instead of failing
the whole import — but only after the Dashboard has shown the user
exactly what would be skipped and they've explicitly confirmed:

- `type: "Ref"` items — the whole subtree under that item is omitted.
- Unexpected files whose extension is `.wav` or `.bak` — the file is
  omitted, the item itself (its `config.yaml`/`body.txt`) is still
  imported normally.

Any *other* validation problem (bad folder name, invalid `config.yaml`,
missing body, a Text item with children, etc.) is never skippable — it
always blocks the import, with or without the opt-in. A caller can mix
skippable and non-skippable problems in the same archive; skipping only
narrows down what's left to fix, it never overrides a real problem. See
`cp-core`'s `CpImportSkipPolicy`/`CpImportSkippedEntry`,
`packages/content-provider/files/src/zip-import.ts`'s `skipPolicy`
parameter, and the Dashboard's confirm dialog
(`packages/dashboard/app/(dashboard)/dashboard/folders/page.tsx`,
`isSkippableImportError`/`importSkipConfirm`).

## Security

- **Zip Slip**: every entry's path is normalized and checked for `..`,
  a leading `/` (absolute path), and backslash-only Windows-style
  separators before it's used to build the logical tree.
- **Symlinks / device files / anything not a regular file or directory**:
  rejected via the ZIP entry's Unix external file attributes (upper 16
  bits of `externalFileAttributes`) — a symlink's mode bits
  (`S_IFLNK`, `0xA000`) or a non-regular/non-directory mode is a hard
  failure, never silently skipped or dereferenced.
- **Encrypted entries**: rejected (checked via the ZIP local file header's
  general-purpose bit flag, bit 0) — never partially processed.
- **Limits** (all hard failures, never silent truncation):
  max ZIP size, max entry count, max total uncompressed bytes, max single
  entry uncompressed bytes, max compression ratio (checked only once an
  entry's uncompressed size is already large enough that a high ratio is
  meaningful — avoids false positives on small, legitimately-compressible
  text), max tree depth, max total item count. See
  `packages/content-provider/files/src/zip-import.ts`'s exported default
  limits for the actual numbers in force.
- Content-Length is never the only size check — the ZIP's own declared
  entry sizes and the actual bytes read are both checked as extraction
  proceeds, so a mismatched/lying header can't bypass a limit.

## Atomicity

`upload → stage → safe unzip → full-tree validation → import plan →
commit` — nothing is written to Postgres until the *entire* tree has
already validated successfully. If any single item anywhere in the tree
is invalid, the whole import fails and **nothing** is added — never a
partial subtree.

The commit itself (`cp-postgre`'s `commitFolderImportPostgre`) is one
Postgres transaction: `BEGIN` → advisory lock on
`(repoGuid, parentAddress)` (same `pg_advisory_xact_lock` pattern
`postgres-cp-provider.ts`'s `createChild` already uses, so a concurrent
normal Folders-tab write under the same parent serializes against it
correctly) → re-verify the parent still exists and is still a Folder →
root-name conflict check → insert every node in the plan (fresh id,
freshly-computed address, `cp_items_write_history`'s trigger context set
per row) → `COMMIT`, or `ROLLBACK` on **any** failure. There is no
partial-commit code path.

## Conflicts

If the target parent Folder already has a direct child with the same name
as the ZIP's root item, the import fails before commit
(`ROOT_NAME_CONFLICT`) — existing data is never silently overwritten.
Nested conflicts inside the imported subtree can't occur: the whole
subtree lands under a freshly-allocated root address, entirely new
address space.

## Staging directory / cleanup

Logical staging root: `02_files_refrenced/<username>/02_files_zip/temp/<import-guid>/`
(same physical volume/env convention as `google-contact-photos.ts`'s
`01_files_photos` and `lead-archives.ts`'s `02_files_zip` — see
`CHAD_CONTACT_PHOTOS_DIR` in `ai-docs/deploy/qnap-data-path.md`'s
neighborhood; `packages/dba/src/cp-import.ts` resolves the absolute path,
`cp-files` never reads env/session itself). `username`/`repoGuid` always
come from the session (`getCurrentUsername`/`getCurrentRepoGuid`), never
from the request body — `cp-files`' own path-containment check
(`assertSafeContactPhotoPath`-equivalent) is defense in depth, not the
only guard.

The staging directory's lifecycle is scoped to **validation only**: the
uploaded ZIP is written there, opened, and fully validated into an
in-memory `CpImportPlan` (which already carries every Text body and
config extra field the commit step needs), and the staging directory is
removed (`try`/`finally`) before the validation call returns — regardless
of whether validation passed or failed. The commit step that follows never
touches the filesystem, so there is nothing left to clean up after a
commit failure either. Only the one `temp/<import-guid>/` directory is
ever removed — never the shared `temp/` parent, never another import's
directory.
