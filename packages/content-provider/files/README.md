# cp-files

Filesystem/Dropbox storage implementation of `cp-core`'s `ContentProviderStorage`. **Stage 2 (read) and Stage 3 (write) are both live**: `GetItem`, `GetByNames`, `GetManyByName`, `FindRecursively`, `Put`, `PostParentItem` all work. `Ref` variants of `Put`/`PostParentItem` throw — unconfirmed against real .NET behavior, not guessed.

Reads and writes the same on-disk structure the real .NET Content Provider uses. **Never tested against real Dropbox data with a write** — all write behavior (`tests/write-smoke.mjs`) is verified against a disposable `/tmp` fixture only, never the real repos this package also reads from for its (read-only) compatibility tests.

## Physical layout (verified 2026-07-12)

Verified two ways: (1) reading the actual .NET source (`packages/net-content-provider/api_charp/SharpRepoService/SharpRepoServiceProg`), not docs; (2) inspecting 12630 real `config.yaml`/`body.txt` pairs on disk at `/Users/pawelfluder/Dropbox/repos`.

```txt
<CP_FILES_STORAGE_ROOT>/
└── repos/
    └── <repo-guid>/            # UUID or legacy 32-hex-chars, one level, no "group" layer
        ├── config.yaml         # required keys: type, name, id, address
        ├── 01/                 # children are STRICTLY numeric (2-3 digit zero-padded)
        │   ├── config.yaml
        │   └── body.txt        # only if type: Text
        └── 02/
            ├── config.yaml
            └── 01/
                ├── config.yaml
                └── body.txt
```

- **Body file: `body.txt`, always, no fallback.** Settled definitively by reading `PathWorker.SetNames`/`GetBodyPath` (`SharpRepoServiceProg/Workers/System/PathWorker.cs:39-43,87-92`) — there is no extensionless `body` variant anywhere in the running .NET code, and zero of the 12630 real files on disk use one. This resolves the contradiction flagged in `documentation/content-provider/next-tasks/typescript-migration-plan.md` section 5.1 and in `packages/cp-plugin/README.md`'s "Known note" — both should be treated as closed now.
- **`config.yaml` is not a closed schema.** .NET deserializes it as a loose dict (`ConfigWorker.cs`); required keys are `type`, `name`, `id`, `address` (enforced by `ItemModel.SetIndentificators`); `refAddress`/`refGuid` appear only on `type: Ref` items; `googleDocId` is a declared-but-unconsumed extra key. There is **no `created` field** — an earlier placeholder version of `cp-core`'s `CpConfig` required one; that was wrong and has been fixed.
- **`address` is slash-joined** (`"<repoGuid>/01/02/03"`) but is **ALWAYS RECOMPUTED**, never read verbatim from config.yaml — see "Address is always self-healed" below.
- **Children are strictly numeric.** `type: Ref` items point elsewhere via `refAddress`/`refGuid` and **are dereferenced** — see "Ref dereferencing" below.

## Address is always self-healed, never trusted from disk

Confirmed two ways on 2026-07-12: live, comparing `cp-files` against the real running API (a real item's config.yaml on disk has a stale `address: "Active/06/64/01"`, but the real API returns `Settings.address: "21d11bdc-f1f4-44d1-b61a-3fa6b039c641/03/06/71/01"`); and via source (`MigrationWorker.TryMigrateConfig`, `SharpRepoServiceProg/Workers/CrudReads/MigrationWorker.cs:78-104`, overwrites the in-memory `address` unconditionally before any "did it change" check, so a stale on-disk value is never visible to a caller). `cp-files` replicates the *visible* behavior (always return `repoGuid + "/" + loca`) on read, without replicating .NET's incidental self-heal-writes-back-on-read behavior — `cp-files` only ever writes `config.yaml` in response to an explicit `Put`/`PostParentItem` call (see below), never as a side effect of a read.

## Ref dereferencing

`GetItem`/`GetByNames`/`GetManyByName`/`FindRecursively` all fully dereference `type: Ref` items — the item you get back **is the target item** (config, body, address all become the target's), matching `ReadRefWorker.IfMineGetItem` (`SharpRepoServiceProg/Workers/CrudReads/ReadRefWorker.cs:19-71`, confirmed by source audit 2026-07-12). `refAddress` is parsed with the same "split on first `/`" rule .NET's `CreateAddressFromString` uses (`paths.ts`'s `parseAddressString`) — no validation that the resulting `repo` segment is an actual GUID.

**In practice, every one of the 68 real `Ref` items in local data has a stale/legacy `refAddress`** (e.g. `"Active/05/18"` — a leftover from an old logical-naming scheme, not `<repoGuid>/<loca>`), so dereferencing always fails for real current data — and it fails **the same way real .NET does**: confirmed live, `GetItem` on a real Ref item throws on both `cp-files` and the actual running .NET API (`PathWorker.HandleError`, surfaced through `ReadFolderWorker.SelectIndexQName`/`ReadRefWorker.IfMineGetItem`). This was cross-checked as a compatibility-test case (`tests/compat-smoke.mjs`'s `testRefErrorParity`), not left as a guess — but the *successful* dereference path (a `Ref` with a genuinely resolvable target) couldn't be verified against any real data, since none exists locally. Not replicated: .NET's extra guid-staleness cross-check/self-heal (`GuidWorker.UpdateRefItemIfNeeded`) — `cp-files` dereferences by `refAddress` directly, a deliberate simplification (that logic is deep and unverifiable with zero real resolvable-Ref data to test against).

**Folder body maps dereference Ref children too**, showing the target's name rather than the Ref's own (matches `ReadFolderWorker.SelectIndexQName`, confirmed by source). A Ref child that fails to dereference is skipped from the map rather than crashing the whole parent — see "Intentional divergences" below; confirmed live that real .NET crashes the *entire* parent Folder's `GetItem` in this exact scenario (stack trace through `SelectIndexQName` → `ListOfIndexesQNames` → `IfMineGetItem`).

## Config

```env
CP_FILES_STORAGE_ROOT=/Users/pawelfluder/Dropbox
```

Must be the **parent** of `repos` (matches the .NET convention — `PreparerModule__NoSqlRepoSearchPaths__0` / `QNAP_REPOS_HOST_PATH`, see `packages/net-content-provider/.env.qnap-test.example`), **not** `packages/cp-plugin`'s `PLUGIN_ROOT` convention, which points at `repos` itself. Two different, already-existing conventions in this codebase — cp-files follows the .NET one deliberately, since behavioral parity with .NET is the entire point of this package.

Never hardcode `/Volumes/cp_1`, `/share/cp_1`, or any other legacy mount — always read from `CP_FILES_STORAGE_ROOT`.

## `loca` addressing

`GetItem(repoGuid, loca)` etc. take `loca` as **slash-joined** numeric segments (`"01/02/003/02"`) — confirmed against the real, already-working contract in `documentation/dba/resolve-paths.md` (`loca = "03/06"`, a plain substring of `Settings.address` with the repo GUID prefix stripped) and against .NET's own `ValidationWorker.ValidateItemLocaBeforePut` (`adrTuple.Loca.Split('/')`). It is therefore the *same* separator as `CpItem.Address` — `loca` is just `address` with the repo GUID prefix removed.

**Not** `packages/cp-plugin`'s dash-joined form (`"01-02-003-02"`, see its `ADDRESS_FORMATS.md`) — that's a separate, unrelated convention cp-plugin uses for its own local HTTP URL path segments. An earlier draft of this package mistakenly copied cp-plugin's dash convention for the `loca` parameter itself; fixed after cross-checking `documentation/dba/resolve-paths.md`.

## `GetByNames` and `GetManyByName`: exact matching semantics (source-confirmed, not approximated)

Both confirmed 2026-07-12 by a full audit of `SharpRepoServiceProg` + its `SimpleRunTests` project (not guessed, not left as an approximation like an earlier version of this README claimed):

- **`GetByNames`** descends one name at a time, matching each against direct children's `config.yaml` `name` (case-sensitive, ordinal — plain C# `==`). If **more than one** direct child shares that exact name, .NET's `SingleOrDefault` throws `InvalidOperationException`, uncaught — `cp-files` replicates this: throws `ContentProviderError`, NOT "first match wins" (an earlier version of this package did pick the first match; fixed after the source audit).
- **`GetManyByName(repo, parentLoca, name)`** searches **grandchildren** of `parentLoca`, not direct children — confirmed both live (against the real API) and via `ManyItemsWorker.GetManyByName`'s source: for each direct child of `parentLoca` (e.g. one lead folder among many), it looks at THAT child's own children for one item named `name`. A direct-child group whose grandchildren have more than one match is **skipped entirely**, not included with duplicates and not thrown as an error to the caller (.NET's inner `SingleOrDefault` throws, caught by `GetManyByName`'s own surrounding try/catch) — `cp-files` replicates this exactly.

## `FindRecursively`: body.txt only, never name (source-confirmed)

Confirmed via `MethodWorker.FindRecursively`'s source and live-tested against real data (4/4 matching addresses on a real "//todo" search): searches **only `body.txt` file contents** (i.e. only `Text`-type items are ever candidates — `Folder`/`Ref` items are never matched), a plain case-insensitive substring match. **Does NOT match against `name`** — an earlier version of this package incorrectly also matched item names; fixed after the source audit. Throws on an empty phrase, matching .NET's `ArgumentException`.

## Intentional divergences from .NET (not approximations — conscious choices for a read-only browsing tool)

- **Missing/corrupt `config.yaml`**: `cp-files` throws `ContentProviderError` immediately. Real .NET silently degrades to an empty dict at the YAML-parse layer (`Custom03YamlOperations.DeserializeFile` swallows all exceptions) and then usually crashes anyway once required keys (`name` especially) turn out missing — throwing immediately is strictly more useful, not less faithful in any way that matters.
- **Missing `body.txt` on a Text item**: `cp-files` returns `""`. Real .NET crashes with an uncaught `FileNotFoundException` (confirmed via a real captured production error in `packages/net-content-provider/architecture/features/devlogs-human-readable-backend-errors.md:113-123`). Softer on purpose.
- **A child that can't be resolved when building a Folder's body map** (missing config, or a `Ref` whose target can't be dereferenced): `cp-files` skips it, the parent `GetItem` still succeeds. Real .NET lets that ONE bad child crash the ENTIRE parent Folder's `GetItem` (confirmed live: a real Folder containing one stale-`Ref` child throws all the way up through `ReadFolderWorker.SelectIndexQName`/`ListOfIndexesQNames`/`IfMineGetItem`). Softer on purpose — `cp-files` verified to return a normal, successful result for this exact real folder (`21d11bdc-f1f4-44d1-b61a-3fa6b039c641/03/18`) where the real API throws.
- **`config.yaml` self-healing**: .NET auto-repairs missing `id`/`type`/`address` and (sometimes) writes the repair back to disk (`MigrationWorker.TryMigrateConfig`) — `cp-files` never writes, so a config missing `id`/`type`/`name` just throws `ContentProviderError` instead of being silently patched.
- **No repo-group discovery beyond one level under `repos/`** (matches real local data and the actual `GuidGroupsHelper.IsUniRepoGroupFolder` code, which validates each direct child of `repos/` as itself being a GUID — no extra "group" layer; a QNAP-only two-level scheme mentioned in an earlier session's notes wasn't found in the real code).

## `Put`/`PostParentItem`: exact write semantics (source-confirmed, 2026-07-12)

- **`PostParentItem(repo, parentLoca, type, name)`** is idempotent get-or-create — matches `PostWriteTextWorker`/`PostWriteFolderWorker`'s source. If a direct child of `parentLoca` already has this `name`, its existing data is returned unchanged (no duplicate created, no error). Otherwise a new child is created at the next free numeric index (`max(existing numeric children) + 1`, `formatIndex` — zero-padded to 2 digits for 0-9, plain digits 10-999, matching `IndexOperations.IndexToString`), with a fresh `randomUUID()` as `id`. `Text` children get an empty `body.txt`; `Folder` children don't (matches source — `PostWriteFolderWorker` never writes a body). Validates every direct child of `parentLoca` is numeric BEFORE creating anything (`ValidationWorker.ValidateParentBeforeCreateChild`) — a stray logical-name folder blocks creation with `ContentProviderError`, not silent corruption.
- **`Put(repo, loca, type, name, content)`** is NOT "find by name" — it targets an existing numeric `loca` directly and overwrites unconditionally, with a **fresh `id` every single call** (does not preserve whatever `id` was there before — matches source). Validates every segment of `loca` itself is numeric first (`ValidationWorker.ValidateItemLocaBeforePut`; empty `loca` is allowed).
- **A real, confirmed .NET bug is faithfully replicated, not fixed**: `PutWriteFolderWorker.IfMinePut` hard-codes `type: "Text"` in the config it writes, regardless of the requested type. Calling `Put(..., "Folder", ...)` on an existing Folder **silently corrupts its `config.yaml` to `type: "Text"`** — and, matching that same source, does NOT write a `body.txt` either, leaving a directory whose config claims `Text` but has no body file at all. `cp-files` reproduces this exactly (see `storage.ts`'s `Put` implementation) rather than "fixing" it — the whole point of this package is behavioral parity, and fixing this here would make `cp-files` and `cp-net-adapter` (proxying the real, still-buggy .NET) disagree on a real write path. If this bug is ever fixed upstream, `cp-files` should follow, not lead.
- **`Ref` variants of both throw `ContentProviderError`** — write behavior for `Ref` items wasn't part of the 2026-07-12 source audit's confirmed scope. Not guessed at.

Verified against a disposable `/tmp` fixture (`tests/write-smoke.mjs`, 18/18 checks): idempotent create, duplicate-name get-or-create, fresh-id-on-Put, the Folder→Text bug reproduced exactly (including the missing body.txt), non-numeric-`loca` rejection, and the repo-corruption guard all behave as documented above.

## Still NOT implemented / confirmed

- No `refGuid` cross-check/self-heal on `Ref` dereferencing (see "Ref dereferencing" above).
- `Put`/`PostParentItem` for `type: "Ref"` (see above).
- No compatibility test comparing `cp-files`' writes against a real, disposable .NET instance — unlike the read operations, there's no safe way to write-test against the real API without either using real production data or standing up a separate, throwaway .NET+filesystem instance, which wasn't done this session.
