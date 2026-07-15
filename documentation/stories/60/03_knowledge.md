# Story 60 — Knowledge

Pointers to documentation and code needed for this Story, and why.

- `documentation/ai-docs/knowledge/02_what-and-where.md` — the mandatory
  entry point; pointed at the docs below instead of guessing file names.
- `documentation/dashboard/common/features/chad-user-data-isolation.md` —
  the general per-user isolation model: `repoGuid = userId`,
  `AsyncLocalStorage`-based `runWithRepoContext`, `resolveCurrentUser()`
  validating the session cookie against `chad_admin`'s real user list.
  Needed to understand that the Folder tab's bug was a *local* bypass of
  an otherwise-correct mechanism, not a flaw in the mechanism itself.
- `documentation/features/folders-features.md` — describes an **older**,
  different "Folders" feature (forms/action + forms/lead record browsing
  by the caller's own `userGuid`) that no longer matches the actual
  current `/dashboard/folders` page. The real current feature is the
  Story 57 Content Provider browser (ported from the standalone Blazor
  admin tool) — this older doc was not rewritten (pre-existing
  duplication, flagged in `02_what-and-where.md`'s own audit section) but
  its mismatch with the current code is worth knowing before reading
  `folders/page.tsx` cold.
- `documentation/dashboard/common/features/responsive-layout-standard.md`
  — the `DashboardPageShell`/`EditorPageShell`/`NavGroup` standard: outer
  frame is `rounded-xl border bg-card`, the shared header row (menu handle
  + `NavGroup`'s `Prev`/`Back`/`Forw`) is rendered automatically, and
  `toolbar` sits in that same row. This is what defines what may legally
  appear "in line 1" for Task 2, and what the one-outer-frame shape must
  look like for Task 3.
- **Code, not doc** (no dedicated feature doc existed for the Folder tab
  before this Story — see `04_content-provider-repo-browser.md`, newly
  added):
  - `packages/dashboard/app/api/folders/repos/route.ts` and
    `app/api/folders/route.ts` — the two endpoints with the bug.
  - `packages/dashboard/app/(dashboard)/dashboard/folders/page.tsx` — the
    repo combobox UI.
  - `packages/dba/src/repo-context.ts` — the existing, already-correct
    `AsyncLocalStorage` mechanism (`runWithRepoContext`/
    `getCurrentRepoGuid`/`getCurrentUsername`), used as the reference
    pattern for how repo scoping is supposed to work in this codebase.
  - `packages/dba/src/client.ts`'s `getAllRepos()` — the CP-wide call the
    old bypass exposed directly; now only called from inside the new
    `repo-access.ts`, never re-exported for browsing purposes.
  - `packages/dashboard/lib/session.ts` / `lib/user-service.ts` —
    `getCurrentUserFromCookies()` → `resolveCurrentUser()`, the canonical
    source of `{ repoGuid, username }` used everywhere, including the
    fix (no new username source was introduced).
- `packages/dashboard/app/(dashboard)/dashboard/content-provider/page.tsx`
  and `app/api/content-provider/*/route.ts.bak` — a **separate**, older
  "Content Provider" admin page found while checking build/lint output
  (missing-hook-dependency warning led to it). Its backing API routes are
  `.ts.bak` (disabled, not live in Next.js), so `/dashboard/content-provider`
  currently 404s on its own data fetch — not a live vulnerability, out of
  this Story's named scope (Task 1 was specifically "zakładka Folder"),
  and `packages/net-content-provider`/its TS rewrite is mid-rewrite per
  existing project memory, so deliberately not touched here. Recorded in
  `06_others_from_report.md` as a flag for the user, not fixed.
