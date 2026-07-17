# Story 68 — Plan

## Scope

`packages/net-content-provider`, app `api_charp/SharpContainerApi` ("sharp-api") only. No changes
to the Content Provider folder/Item model, no new package, no Dashboard/API changes.

## Part A — Code fix (`GuidGroupsHelper.GetGuidGroupsForSearchFolders`), not blocked

File: `api_charp/SharpRepoService/SharpRepoServiceProg/Helpers/GuidGroupsHelper.cs`

1. Stop appending a literal `"repos"` segment. Treat each configured search path as the ready root
   directory that directly contains GUID-named repo folders (this matches the pre-`c4931f2`
   historical behavior, and is what the Story's "Oczekiwane działanie" section describes).
2. Fix the `.First()` bug: scan every entry of `searchFolders`, not just the first.
3. Validate all configured paths up front (`Directory.Exists`) before scanning; if any are
   missing, throw one `InvalidOperationException` whose message lists every missing path exactly
   as configured (not a bare/generic exception) — and don't stop checking the rest just because one
   is fine or one is broken.
4. Detect duplicate repo GUIDs across different configured search paths (same GUID folder name
   found under two different roots) and throw an `InvalidOperationException` naming the GUID and
   both full physical paths — instead of letting it surface later as `PathWorker.HandleError()`'s
   bare, undiagnosable `InvalidOperationException()`.

Leave alone (confirmed dead/unused via grep + not referenced by the active `.sln`): `GuidGroupsHelperBackup.cs`,
`PathWorker.GetGroupsFromSearchPaths` (non-`2`), `GetSpecialWithGuidFolders`/`AddRepoFolders`.

## Part B — Tests, not blocked

`GuidGroupsHelper` is a plain, dependency-free class (no DI), so these can be fast, isolated unit
tests against a temp directory fixture — no precedent for this exists yet in the repo, so this adds
a small new test class rather than extending the existing `SimpleRunTests` (which are real-disk
integration tests via `DefaultPreparer`, not suited to synthetic fixtures). New test file location:
`api_charp/SharpRepoServiceTests/` (the project already exists but isn't wired into the active
`.sln` — will add a project reference to `SimpleApi.sln` so the tests actually run, without
otherwise touching that project's existing dead `UnitTest1.cs`/`JsonWorkerTests.cs`).

Covers the five tests from the Story input against a temp-folder fixture (`Path.GetTempPath()` +
`Directory.CreateDirectory`, cleaned up after each test):
1. one path already ending in `/repos` → not doubled
2. one path not ending in `/repos` → nothing appended
3. two paths at once → repos from both are found
4. one non-existent path → exception message contains the exact missing path
5. same GUID folder name under both paths → exception message contains the GUID and both full paths

## Part C — Environment config values (Problem 3) — BLOCKED, needs your input

This is the part I can't proceed on without guessing. The two new paths given:

```
/Dropbox/pawelpanda2/repos
/Dropbox/kamilgame042
```

don't match either existing environment's path convention:
- Local dev / local-mac Docker today use `/Users/pawelfluder/Dropbox` (host path, and container
  path is made identical via a `-v host:host` mount) — a real macOS path, not `/Dropbox/...`.
- QNAP TEST today uses container path `/data/repos` (mounted from host `/share/Dropbox`) — also not
  `/Dropbox/...`.
- I checked this Mac's filesystem: there is no `/Dropbox` at root, and no `pawelpanda2` or
  `kamilgame042` folder anywhere under the real Dropbox.

I've asked a clarifying question (see chat) covering: which environment(s) these two paths are for,
and whether they're host paths missing a prefix (e.g. `/Users/pawelfluder/Dropbox/pawelpanda2/repos`)
or new container-internal mount targets that need a new `-v` bind mount added to a run/deploy script.
Once answered, Part C becomes: set `NoSqlRepoSearchPaths` (as a 2-element array) in exactly one
config location per environment (no competing duplicate settings), matching whatever the answer
establishes as host vs. container path — and, since Part A removes the "repos" auto-append, the
QNAP TEST env value must be updated in the same change to keep including its trailing `repos`
segment explicitly (today it relies on the bug to reach `/share/Dropbox/repos/<guid>` — see
`03_knowledge.md`), otherwise QNAP TEST silently stops finding any repos.

QNAP PROD has no existing config for this at all (confirmed: no `.env.qnap-prod*`, no prod deploy
scripts exist yet) — whether this Story needs to create one from scratch is also part of the
question.

## Part D — Submodule + CHAD commit flow, not blocked (mechanical, follows the Story input's instructions)

1. Commit Part A + Part B in the `net-content-provider` repo, push to its own remote.
2. Update the `packages/net-content-provider` submodule pointer in `chad`, plus whichever config
   file(s) Part C resolves to (if any live in `chad` rather than inside the submodule — e.g. deploy
   scripts already live inside `03_scripts/` within the submodule itself, so this may end up being
   submodule-pointer-only).
3. Separate commit in `chad` for the pointer bump, pushed to its remote — kept clean of unrelated
   changes.
4. Report both commit hashes and push confirmation at the end, per the Story input's own
   "Weryfikacja końcowa" checklist.
