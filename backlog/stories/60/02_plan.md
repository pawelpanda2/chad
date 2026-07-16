# Story 60 — Plan

Presented to the user before implementation started (Task 1 is the
priority; Tasks 2–3 follow only after Task 1 is fixed, tested, and the
combobox is locked, per the user's explicit ordering).

## 1. Root cause of the leak

`packages/dashboard/app/api/folders/repos/route.ts` and
`app/api/folders/route.ts` (the Folder tab, a Content Provider browser
added in Story 57) contained a **deliberate hardcoded bypass**: if the
logged-in user's `username === 'pawel_f'`, the repo-list endpoint called
dba's raw `getAllRepos()` (`IRepoService/IMethodWorker/GetAllReposNames` —
every repo known to the Content Provider, across all users and all apps)
and returned the whole list to the browser; the item endpoint additionally
accepted a client-supplied `repoGuid` query param and honored *any* value
for that same user. This was a self-inflicted admin exception ("Pawel is
the operator, give him everything", mirroring his separate standalone
Blazor admin tool), not a bug in the general per-user isolation mechanism
— the other ~17 dashboard routes (Leads, Statuses, Beeper CRM, etc.)
already resolve their repo strictly from the session via
`runWithRepoContext`/`getCurrentRepoGuid()` and never take a repo id from
the client.

## 2. Current data flow

`getCurrentUserFromCookies()` → `resolveCurrentUser()` looks up the
session cookie's GUID in `chad_admin`'s real user list and returns
`{ repoGuid, username }` (untrusted cookie values resolve to nothing). For
17 routes that is the end of the story — `repoGuid` never leaves the
server, never comes from the client. The Folder tab's two routes instead
ignored that isolation for `pawel_f` and let the browser pick any repo,
including private repos of `kamil_s` and of unrelated apps discovered by
the same Content Provider instance.

## 3. Where isolation must be enforced

In `packages/dba`, per the user's explicit requirement — not in the
Next.js route. A new dba module fetches the real CP repo list (dba
already can, via the existing `getAllRepos()`) and returns **only** the
repo whose name is **exactly** `chad_<username>` (canonical `username`
from the existing, already-validated session — no new source of truth),
denying (no fallback, no full list, no name leak in errors) when there's
zero or more than one match, or no username. Both Folder routes call only
this function; the `pawel_f` bypass and the client-supplied-`repoGuid`
trust path are removed entirely.

## 4. Plan

- `packages/dba/src/repo-access.ts`: `resolveOwnRepo(username)` (strict
  `chad_<username>` match, deny-by-default) — exported from `index.ts`.
  Matching logic split into a pure, injectable-fixture function
  (`pickOwnRepo`) so it can be unit-tested without a real Content
  Provider.
- `/api/folders/repos`: always returns exactly one repo (the caller's),
  via dba; no admin exception.
- `/api/folders`: always resolves its own repo via dba; any client
  `repoGuid` that differs → `403 FORBIDDEN_REPO`, no repo names in the
  body.
- Folder page UI: repo combobox becomes disabled (single value shown),
  no way to select or restore another repo.
- Task 2 (after Task 1 is done): move Beeper's non-navigation
  buttons/controls out of the shared header row into a second row inside
  the outer `DashboardPageShell` frame, across all 4 Beeper pages.
- Task 3 (after Task 2): audit every `DashboardPageShell` page for
  duplicate/nested "outer frame" styling and fix any found.

## 5. Test plan

dba-level unit tests covering the 10 required cases (exact-match only, no
other CHAD repos, no other apps' repos, manual repoGuid override denied,
no match ≠ fallback, no username ≠ list, error payload has no repo names,
refresh doesn't restore a bad selection, combobox non-editable, direct
request bypassing the UI still blocked) + manual verification against a
real local Content Provider (not mocked) logged in as `pawel_f`,
confirming only `chad_pawel_f` is ever visible/reachable, including a
direct curl attack with a fabricated/other-user `repoGuid`.
