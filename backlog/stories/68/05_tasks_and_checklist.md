# Story 68 — Tasks Checklist

| # | Ai Status | Real Status | Task |
|---|-----------|-------------|------|
| 1 | DONE      |             | Content Provider scans repos from every configured search path, not just the first, and no longer forces a "repos" suffix onto any of them |
| 2 | DONE      |             | Content Provider fails with a precise error naming the exact missing path when a configured search path doesn't exist, instead of silently skipping it |
| 3 | DONE      |             | Content Provider fails with a precise error naming the GUID and both physical paths when the same repo GUID exists under two different configured search paths |
| 4 | DONE      |             | Local dev, local-mac-docker, and QNAP shared/TEST are all configured with the two real search paths (pawelpanda2 + kamilgame042) |
| 5 | DONE      |             | Two corrupted repo config.yaml files (found only once both search paths were actually scanned together) fixed — no more app-startup crash |

**Correction (2026-07-17, later same session):** Task 4's original QNAP
values (`/shared/Dropbox/pawelpanda2/repos`, `/shared/Dropbox/kamilgame042/repos`)
were wrong — never verified against the real QNAP filesystem. A live SSH
check found `/shared` doesn't exist at all on the QNAP; the real mount is
`/share/Dropbox` (symlink to `/share/CACHEDEV1_DATA/Dropbox`), containing
`pawelpanda2` (36 repos) and `kamilgame042` (4 repos) as direct subfolders.
Fixed in `net-content-provider` commit `e57f6e2` and propagated to the
**canonical** `bash-scripts/dashboard/00_qnap_shared/01_config.sh` +
`docker-compose.qnap.shared.yml` (not touched by the original Task 4, which
only reached the legacy standalone `packages/net-content-provider/03_scripts/qnap/`
deploy path — the canonical compose-based QNAP shared stack is the one
actually live in production). Also fixed the equivalent Mac-side local dev
paths (`02_local_mac_tmux/01_config.sh`, `.env.local`/`.env.local.example`
`CP_REPOS_HOST_PATH_2`, `run-content-provider-if-needed.sh`'s second bind
mount) — all previously missing the second search root entirely.

**Task 5 detail:** once both search paths were correctly scanned together
(previously only ever tested one at a time), two real, pre-existing data
problems surfaced — both root-level `config.yaml` files missing/empty
`address` (`f87be470-2ed3-4fca-897c-7be2df486160` under the main account,
`21d11bdc-f1f4-44d1-b61a-3fa6b039c641` under kamilgame042 — the latter is
the shared repo used by leads/reports/beeper app-wide). Both crashed the
whole Content Provider API at startup (an unhandled exception during
`InitGroupsFromSearchPaths`, not a per-repo failure). Fixed by setting
`address` to match each repo's own `id` (the confirmed convention from 4
other working repo roots). `21d11bdc`'s folder also had unrelated
zip-extraction debris (`__MACOSX/`, a duplicate nested folder) cleaned up by
the user directly in their real Dropbox data — not a code or git change.

# Task 1 — Scan every configured search path, no forced "repos" suffix

**Requested:** the configured path itself (e.g. `/Dropbox/pawelpanda2/repos`) should be treated
as the ready root directory containing GUID-named repo folders directly — not have `/repos`
appended again — and every entry of the configured list should be scanned, not just the first.

**Done:** `GuidGroupsHelper.GetGuidGroupsForSearchFolders` (`api_charp/SharpRepoService/SharpRepoServiceProg/Helpers/GuidGroupsHelper.cs`)
no longer does `Path.Combine(searchFolders.First(), "repos")`; it now iterates every entry of the
configured list and scans each one directly for GUID-named subfolders. Root cause (confirmed via
`git log`): commit `e3c3d90` (2026-06-14) added the `foreach` loop back but left `searchFolders.First()`
inside it — a one-line regression, not a design that ever worked as intended.

**Files changed:** `api_charp/SharpRepoService/SharpRepoServiceProg/Helpers/GuidGroupsHelper.cs`

**Tested:** 3 new isolated unit tests in `api_charp/SimpleRunTests/SimpleRunTests/GuidGroupsHelperTests.cs`
against temp-directory fixtures (`ConfiguredPathEndingInRepos_IsNotDoubled`,
`ConfiguredPathNotEndingInRepos_NothingAppended`, `TwoSearchPaths_ReposFromBothAreFound`) — all pass.
Also confirmed end-to-end against real disk data via `68_features.cs` (`GetAllRepos_IncludesReposFromEveryConfiguredSearchPath`).

**Status: DONE**

# Task 2 — Precise error for a missing configured path

**Requested:** validate every configured path exists; if not, name the exact missing path in the
error rather than hiding it behind a generic exception or silently skipping it.

**Done:** `GetGuidGroupsForSearchFolders` now checks `Directory.Exists` for every configured path up
front and throws `InvalidOperationException` listing every missing path by its exact configured
value, before any scanning happens.

**Files changed:** same as Task 1.

**Tested:** `NonExistentPath_ErrorNamesExactPath` in `GuidGroupsHelperTests.cs` — asserts the thrown
exception's message contains the exact missing path. Passes.

**Status: DONE**

# Task 3 — Precise error for a duplicate repo GUID across search paths

**Requested:** if the same repo GUID is found under two different configured search paths, don't
pick one arbitrarily or overwrite — report a clear error naming the GUID and both physical paths.

**Done:** `GetGuidGroupsForSearchFolders` now tracks every GUID folder it has seen (name → first
full path); if the same GUID name is encountered again under a different search path, it throws
`InvalidOperationException` naming the GUID and both full physical paths.

**Files changed:** same as Task 1.

**Tested:** `SameGuidInTwoSearchPaths_ErrorNamesGuidAndBothPaths` in `GuidGroupsHelperTests.cs` —
passes against a synthetic fixture. This also fired for real: running the fix against this Mac's
actual Dropbox data (see `06_others_from_report.md`) surfaced a genuine duplicate GUID between the
two configured Mac paths, exactly as designed — not a test bug.

**Status: DONE**

# Task 4 — Configure local dev and QNAP TEST with the two new paths

**Requested:** set the corrected paths exactly as given (Input 3/4) — Mac:
`/Users/pawelfluder/Dropbox/repos` + `/Volumes/Dropbox/kamilgame042/repos`; QNAP:
`/shared/Dropbox/pawelpanda2/repos` + `/shared/Dropbox/kamilgame042/repos` — treated as host paths,
in exactly one config location per environment.

**Done:**
- `api_charp/SharpContainerApi/appsettings.json` (local dev, native or local-mac Docker):
  `NoSqlRepoSearchPaths` now has both Mac paths.
- `03_scripts/03_local-mac_docker/02_run_api_charp.sh`: added a second `-v` bind mount for
  `/Volumes/Dropbox/kamilgame042` (host == container path, same convention as the existing
  `/Users/pawelfluder/Dropbox` mount) so the container can see it too.
- `.env.qnap-test.example` + `03_scripts/qnap/begin_qnap_test.sh` + `03_scripts/qnap/deploy_qnap_test.sh`:
  replaced the single `QNAP_REPOS_HOST_PATH`/`CONTAINER_REPOS_PATH` pair with
  `QNAP_REPOS_PATH_0`/`QNAP_REPOS_PATH_1` (the two given QNAP paths, host path == container path,
  each independently validated and independently bind-mounted; both fed to
  `PreparerModule__NoSqlRepoSearchPaths__0`/`__1`).
- QNAP PROD: confirmed no deployment scripts/`.env.qnap-prod*` exist for this app at all yet —
  nothing to update there; creating a QNAP PROD deployment from scratch was not part of this
  Story's ask and would be a much larger change.

**Files changed:** `api_charp/SharpContainerApi/appsettings.json`,
`03_scripts/03_local-mac_docker/02_run_api_charp.sh`, `.env.qnap-test.example`,
`03_scripts/qnap/begin_qnap_test.sh`, `03_scripts/qnap/deploy_qnap_test.sh`.

**Tested:** confirmed no other script references the old `QNAP_REPOS_HOST_PATH`/`CONTAINER_REPOS_PATH`
names (`grep -rn` across the repo, clean). Full solution builds with 0 errors
(`dotnet build SimpleApi.sln`). See `06_others_from_report.md` for the real-data caveat on the Mac
side (duplicate GUID between the two configured Mac paths, being cleaned up by the user separately).

**Status: DONE**
