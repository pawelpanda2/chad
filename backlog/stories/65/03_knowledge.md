# Story 65 — Knowledge / Etap 1 audit results

## Repo `chad` (the monorepo)

- Root: `/Users/pawelfluder/03_synch/01_files_programming/08_nodejs/chad`
- Remote: `origin` → `git@github.com:pawelpanda2/chad.git`
- Path in question: `chad/packages/net-content-provider`
- **Currently tracked directly by chad's own git** (not a submodule):
  - `git ls-files packages/net-content-provider | wc -l` → **552 tracked files**
  - No `.gitmodules` file exists in `chad` at all.
  - `packages/net-content-provider/.git` does not exist (confirmed no nested
    repo).
  - `git check-ignore -v packages/net-content-provider` → not ignored.
- History of this exact path inside chad (`git log --follow`):
  ```
  6029868  2026-07-13  update  (added qnap-test local-mac docker scripts)
  14fd2c0  2026-07-12  net-content-provider: move standalone Blazor QNAP TEST port off 12020
  56ed0a6  2026-07-11  Rename packages/legacy-content-provider to packages/net-content-provider
  7e63eeb  2026-07-11  Add QNAP TEST deployment scripts for the legacy .NET Content Provider
  ```
  `56ed0a6`'s own commit message says, verbatim: *"Per user decision: rename
  now rather than waiting for the eventual submodule extraction."* — i.e.
  this exact migration (to a submodule) was already the plan of record
  before this Story existed.
- The commit that first added the ~552-file `packages/legacy-content-provider`
  tree wholesale was **not found** by `git log --follow` (it only traces
  simple renames; the original bulk-add predates or bypasses what `--follow`
  can detect, e.g. it may have arrived as part of a much larger initial
  commit). This does not matter for the migration itself — chad's git
  history for this path is not being preserved into the submodule anyway
  (see `02_plan.md`, "why history reconciliation isn't needed").

## Standalone repo `content-provider`

- Path: `/Users/pawelfluder/03_synch/01_files_programming/08_nodejs/content-provider`
  (confirmed directly by the user in Input 2 — matches what this audit
  found independently).
- `.git` exists: **yes**, real repo, 55 commits on `main`.
- Remote: `origin` → `git@github.com:pawelpanda2/contentprovider.git`
- Branch: `main`, tracking `origin/main`, **0 ahead / 0 behind** — fully
  pushed, nothing local-only in the branch history itself.
- HEAD: `14389985cfc8c218d9278baed7abacd6063231e2` ("update", committed
  2026-07-09 02:12:30 +0200).
- Uncommitted changes (working tree, not staged):
  - `api_charp/SharpContainerApi/appsettings.json` — `ApiUrls` changed from
    the committed `12024` back down to `12004` (i.e. HEAD already has the
    canonical port; the *uncommitted* local edit reverts it to the old
    legacy port — looks like a stray/accidental local edit, not intentional
    forward progress).
  - `api_charp/SharpRepoService/SharpRepoServiceProg/Workers/System/PathWorker.cs`
    — purely cosmetic (one `.Where(...).ToList()` call reformatted onto two
    lines; semantically identical).
  - No staged changes, no stash entries.
- Untracked-but-present local junk (IDE files, `.env`, `TestResults`,
  `package-lock.json`, `.vscode.backup`, etc.) — all confirmed **not tracked
  by git** (`git ls-files <path>` returns 0 for each). Irrelevant to "losing
  history", but relevant to "don't silently delete local files" if this
  directory's working tree is about to be overwritten (see plan).

## Content comparison: `content-provider` (standalone) vs `chad/packages/net-content-provider`

Full recursive diff (excluding `.git`, `.DS_Store`, `bin`, `obj`,
`node_modules`, `.next`, `Binaries`) shows real, substantive divergence —
**chad's copy is ahead of the standalone repo's committed history** in
several places:

- `api_charp/SharpContainerApi/Preparers/DefaultPreparer.cs` — chad's
  version is 317 lines vs. the standalone repo's 256 lines. The extra ~60
  lines are a `/health` endpoint rewrite (real search-path diagnostics:
  `pathDiagnostics`, `repoServiceAvailable`, `repoCount`, `anyRepoFound` —
  see Story 64's `03_knowledge.md` for the full read of this file). A
  pickaxe search (`git log --all -S"pathDiagnostics"` and
  `-S"repoServiceAvailable"`) across the **entire** standalone repo history
  found **zero** matches — this code does not exist anywhere in
  `content-provider`'s git history, only in chad's working copy.
- `03_scripts/03_local-mac_docker/*` — several scripts differ, and chad has
  four extra scripts (`install-startup.sh`, `run_both.sh`,
  `system-startup.sh`, `un-install-startup.sh`) not present at all in the
  standalone repo.
- `03_scripts/qnap/` — an entire directory (6 scripts:
  `deploy_qnap_test.sh`, `begin_qnap_test.sh`, `build_qnap_test.sh`,
  `status_qnap_test.sh`, `lib.sh`, `end_qnap_test.sh`) exists only in chad —
  this matches the QNAP TEST deployment work done in chad commits `7e63eeb`/
  `14fd2c0`/`6029868` above.
- `.env.qnap-test` (chad only, gitignored, real filled-in values, dated
  2026-07-11) and `.env.qnap-test.example` differ — chad has newer/extra
  QNAP env scaffolding.
- `appsettings.json`, `PathWorker.cs` — see above; chad's committed state
  already matches the *good* values (`12024` port, standard formatting).
- `front_blazor/BlazorApp` — several files differ (`MainLayout.razor.css`,
  `NavMenu.razor.css`, `RegisterDto.cs`, `UserProfile.cs`,
  `wwwroot/index.html`, `sample-data/weather.json`) — not yet individually
  diffed line-by-line; noted here as remaining, unreviewed divergence to be
  aware of, not blocking the plan (the migration approach in `02_plan.md`
  doesn't require reconciling these — chad's content wins outright per
  Input 3).
- `aspire/DataLib.*` — several files differ, not yet individually diffed.

**Given Input 3's explicit instruction ("Nie interesuje mnie, czy zawartość
istniejącego osobnego repo jest starsza lub inna... Źródłem prawdy ma być
aktualna zawartość chad/packages/net-content-provider")**, none of this
divergence needs to be reconciled file-by-file — chad's current working
tree is being taken as-is as the new authoritative state. This section
exists purely as the audit record of *what* is being overwritten in the
standalone repo's working tree, for the record and for rollback
verification.

## Disk space (relevant to the backup step)

`df -h` on the volume hosting the whole workspace shows **3.3 GiB free,
100% capacity used**. The two backups requested in Etap 2 total
~780 MB (100 MB for chad's copy + 679 MB for a full copy of the standalone
repo including its `.git`, `Binaries`, etc.) — comfortably fits, but the
volume is essentially full; flagged to the user rather than proceeding
silently, since a disk-space failure mid-copy would produce a *silently
truncated, false-safety* backup, which is worse than no backup.
