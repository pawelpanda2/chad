# Story 68 — Knowledge

Repo: `packages/net-content-provider` (separate git repo, submodule of `chad`). App in scope:
`api_charp/SharpContainerApi` ("sharp-api").

## The `/repos` append bug — exact location

`api_charp/SharpRepoService/SharpRepoServiceProg/Helpers/GuidGroupsHelper.cs:38-67`,
method `GetGuidGroupsForSearchFolders(List<string> searchFolders)`:

```csharp
foreach (var searchFolder in searchFolders)
{
    var reposFolder = Path.Combine(searchFolders.First(), "repos");   // BUG: always .First(), always appends "repos"
    var found = Directory.Exists(reposFolder);
    if (!found) { continue; }                                        // BUG: silently skips missing paths, no error
    ...
}
```

Two independent bugs in one method:
1. `searchFolders.First()` is used inside the loop instead of the loop variable `searchFolder` — so
   only the first configured search path is ever scanned, no matter how many are configured.
2. A literal `"repos"` segment is unconditionally appended via `Path.Combine`.
3. (related) missing directories are silently `continue`d — no error surfaces unless *every*
   configured path fails to yield any repo (checked at `RepoService.InitGroupsFromSearchPaths`,
   which throws a bare `new Exception()` with no message if `GetReposCount() == 0`).

Call chain: `DefaultRegistration.InitGroupsFromSearchPaths()` (reads
`PreparerModule:NoSqlRepoSearchPaths` as `string[]`) → `IRepoService.InitGroupsFromSearchPaths` →
`RepoService` → `MethodWorker` → `MemoryWorker.InitGroupsFromSearchPaths` →
`PathWorker.GetGroupsFromSearchPaths2(searchPaths)` → `GuidGroupsHelper.GetGuidGroupsForSearchFolders`.

`PathWorker.GetGroupsFromSearchPaths2` (`api_charp/SharpRepoService/SharpRepoServiceProg/Workers/System/PathWorker.cs:108-131`)
flattens the returned `Dictionary<string, List<string>>` into `reposPathsList`, then builds
`_repoModelsList` (one `RepoModel` per GUID-named repo folder, read via its `config.yaml`).
`GetRepoPath(repo)` (`PathWorker.cs:63-77`) looks a repo up by GUID/name in `_repoModelsList` and
calls `HandleError()` → bare `throw new InvalidOperationException()` (no message) if zero or more
than one match — this is the "hidden generic exception" the Story explicitly asks not to repeat
for the new duplicate-GUID case.

There's also a dead sibling `GuidGroupsHelperBackup.cs` (unused anywhere, confirmed by grep) with
the old single-root `.First() + "/repos"` logic, and a dead `PathWorker.GetGroupsFromSearchPaths`
(non-"2") that calls `GetSpecialWithGuidFolders`/`AddRepoFolders` — neither is wired up; leave both
alone, out of scope.

## Git history — multi-root support existed, then broke

- `e242020` (2026-06-10): `GetGuidGroupsForSearchFolders` genuinely looped every `searchFolder` and
  scanned it **directly** (no `"repos"` suffix at all) for GUID-named subfolders. This is the
  closest historical match to what Story 68 now asks for.
- `c4931f2` (2026-06-10, same day): rewritten to single-root + `.First() + "/" + "repos"` — this is
  where the `"repos"` literal was introduced (preserved today, unused, as `GuidGroupsHelperBackup.cs`).
- `e3c3d90` (2026-06-14): added a `foreach` loop back around the single-root logic (looked like
  restoring multi-root) but forgot to swap `searchFolders.First()` for the loop variable — this is
  the exact current bug, unchanged since (confirmed via `git log -- <file>`; the `5934fdf` snapshot
  resync on 2026-07-17 touched other files but not this one).

Conclusion: no need for a new config mechanism — `NoSqlRepoSearchPaths` was already array-shaped
end-to-end (`string[]` in `appsettings.json`, `List<string>` through every layer, `__0`/`__1`
env-var overrides already supported by ASP.NET Core's config binder). The fix is contained to
`GuidGroupsHelper.GetGuidGroupsForSearchFolders`.

## Config locations (per environment) — see full detail in Explore-agent findings this Story was based on

| Environment | Current `NoSqlRepoSearchPaths` value | Host or container path | Set in |
|---|---|---|---|
| Local dev, no Docker | `["/Users/pawelfluder/Dropbox"]` | host (native process) | `api_charp/SharpContainerApi/appsettings.json` |
| Local-mac Docker | same value, no env override | container path, deliberately == host path via `-v /Users/pawelfluder/Dropbox:/Users/pawelfluder/Dropbox` | `03_scripts/03_local-mac_docker/02_run_api_charp.sh` |
| QNAP TEST | `PreparerModule__NoSqlRepoSearchPaths__0=/data/repos` (`CONTAINER_REPOS_PATH`), host side `QNAP_REPOS_HOST_PATH=/share/Dropbox` bind-mounted to it | container path | `.env.qnap-test.example`, `03_scripts/qnap/begin_qnap_test.sh` |
| QNAP PROD | does not exist yet | — | — |

Important existing-behavior detail: on QNAP TEST, the **real** GUID-repo folders live at
`/share/Dropbox/repos/<guid>` on the host. The container mounts `/share/Dropbox` (the Dropbox root,
no `repos` in the name) to a container directory *named* `/data/repos`. Today's buggy
`Path.Combine(x, "repos")` therefore resolves to `/data/repos/repos`, which is where the real GUID
folders actually are inside the container — i.e. QNAP TEST today accidentally *depends on* the
`"repos"`-append bug to reach real data. Removing the append (per Story 68 Problem 1) will require
updating the QNAP TEST env value itself to already include the trailing `repos` segment, or the
QNAP TEST container will stop finding any repos. This is a real, config-breaking side effect of the
requested fix and must be handled in the same change, not left as a surprise regression.

`.env.qnap-test.example` already has a comment (added in an earlier QNAP-TEST-deployment task)
explicitly flagging this exact bug as a known, deliberately-deferred TODO — Story 68 is that
deferred fix.

## The ambiguity that stops full Problem-3 implementation right now

The two new paths given in the Story input:
```
/Dropbox/pawelpanda2/repos
/Dropbox/kamilgame042
```
Checked on this Mac: there is no `/Dropbox` at filesystem root, and no `pawelpanda2` or
`kamilgame042` folder anywhere under the real Dropbox (`/Users/pawelfluder/Dropbox`) or its `repos`
subfolder. Neither of the two currently-existing mount conventions uses a bare `/Dropbox/...` path:
local-mac Docker mounts host `/Users/pawelfluder/Dropbox` to the identical container path; QNAP TEST
mounts host `/share/Dropbox` to container `/data/repos`. So `/Dropbox/pawelpanda2/repos` matches
neither an existing host path nor an existing container mount path in this codebase today — per the
Story's own stop condition ("Zatrzymaj się tylko wtedy, gdy aktualna konfiguracja nie pozwala
jednoznacznie ustalić, czy podane ścieżki dotyczą hosta czy wnętrza kontenera"), this needs the user
to clarify before the config values (Problem 3) are set anywhere. See `02_plan.md` / the question
asked mid-Story for the resolution.

Code-level fix (Problems 1 and 2) does **not** depend on this answer and can proceed independently.
