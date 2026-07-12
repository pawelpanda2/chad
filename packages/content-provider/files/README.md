# cp-files

Filesystem/Dropbox storage implementation of `cp-core`'s `ContentProviderStorage`. **Stage 2, read-only**: `GetItem`, `GetByNames`, `GetManyByName`, `FindRecursively` work; `Put`/`PostParentItem` throw (`ContentProviderError`) — Stage 3.

Reads the same on-disk structure the real .NET Content Provider writes. Never writes. Never modifies real data.

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
- **`address` is slash-joined** (`"<repoGuid>/01/02/03"`) and is read verbatim from config.yaml into `CpItem.Address` — never recomputed from the physical path. A dash-joined form exists in the .NET codebase too, but only in a separate class used for building outward-facing URLs (`SharpOperations` project) — not the persisted address.
- **Children are strictly numeric.** `type: Ref` items point elsewhere via `refAddress`/`refGuid` and are **not dereferenced by cp-files yet** — `GetItem` on a `Ref` item returns its own config.yaml (with `Body: ""`) rather than following the reference. Flagged, not silently guessed at.

## Config

```env
CP_FILES_STORAGE_ROOT=/Users/pawelfluder/Dropbox
```

Must be the **parent** of `repos` (matches the .NET convention — `PreparerModule__NoSqlRepoSearchPaths__0` / `QNAP_REPOS_HOST_PATH`, see `packages/net-content-provider/.env.qnap-test.example`), **not** `packages/cp-plugin`'s `PLUGIN_ROOT` convention, which points at `repos` itself. Two different, already-existing conventions in this codebase — cp-files follows the .NET one deliberately, since behavioral parity with .NET is the entire point of this package.

Never hardcode `/Volumes/cp_1`, `/share/cp_1`, or any other legacy mount — always read from `CP_FILES_STORAGE_ROOT`.

## `loca` addressing

`GetItem(repoGuid, loca)` etc. take `loca` as **slash-joined** numeric segments (`"01/02/003/02"`) — confirmed against the real, already-working contract in `documentation/dba/resolve-paths.md` (`loca = "03/06"`, a plain substring of `Settings.address` with the repo GUID prefix stripped) and against .NET's own `ValidationWorker.ValidateItemLocaBeforePut` (`adrTuple.Loca.Split('/')`). It is therefore the *same* separator as `CpItem.Address` — `loca` is just `address` with the repo GUID prefix removed.

**Not** `packages/cp-plugin`'s dash-joined form (`"01-02-003-02"`, see its `ADDRESS_FORMATS.md`) — that's a separate, unrelated convention cp-plugin uses for its own local HTTP URL path segments. An earlier draft of this package mistakenly copied cp-plugin's dash convention for the `loca` parameter itself; fixed after cross-checking `documentation/dba/resolve-paths.md`.

## Known approximations (flagged, not guessed silently)

- **`GetByNames` tie-breaking**: descends by matching each name against child `config.yaml` `name` fields, first match in ascending numeric folder order. The real .NET tie-breaking behavior (if two children share a logical name) wasn't confirmed by the 2026-07-12 audit.
- **`FindRecursively` matching**: case-insensitive substring match against `config.yaml`'s `name` and `body.txt` content. Real .NET's exact matching semantics weren't part of the audit scope.
- **`Ref` items**: detected (`type === "Ref"`) but not dereferenced. `packages/net-content-provider`'s `ReadRefWorker` does real reference-resolution logic not yet ported.

Both approximations need a compatibility-test pass against real `/invoke` calls (via `cp-net-adapter`) before being trusted for anything beyond casual browsing.

## Does NOT do

- No writes (`Put`/`PostParentItem` throw).
- No `config.yaml` self-healing (.NET's `MigrationWorker.TryMigrateConfig` auto-repairs missing `id`/`type`/`address` and writes the repair back — cp-files surfaces a `ContentProviderError` instead).
- No repo-group discovery beyond one level under `repos/` (matches real local data; a QNAP-only two-level "group-guid" scheme mentioned in an earlier session's notes was not found in the actual `GuidGroupsHelper` code and is not implemented).
