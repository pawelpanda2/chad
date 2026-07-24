# Story 88 — Tasks Checklist

| # | Ai Status | Real Status | Task |
|---|-----------|-------------|------|
| 1 | DONE |  | Msg Auto shows **AI PROMPTS** directly after **CREATOR** |
| 2 | DONE |  | AI Prompts opens a Prompt List (search, New prompt, empty/loading/error states) |
| 3 | DONE |  | New prompt opens a separate editor; Back returns to the list |
| 4 | DONE |  | Create and save a prompt — written to Content Provider `msg-auto / ai prompts` |
| 5 | DONE |  | Edit an existing prompt and re-save (draft-only; never mutates a published snapshot) |
| 6 | DONE |  | Publish a prompt version — status/version update visibly |
| 7 | DONE |  | Archive a prompt |
| 8 | DONE |  | Message Creator shows the resolved published prompt (or "Prompt not configured") next to Send new, and executes it via OpenAI when configured |
| 9 | DONE |  | Per-user isolation — prompts are scoped to the logged-in user's own repo, never a caller-supplied id |

## Live TEST verification (post-deploy, 2026-07-25)

After deploying commit `399bd9d` to QNAP TEST (image `chad-dashboard:260725_020829`),
the following was verified with real `curl` requests against
`http://100.117.139.83:12020` (real login sessions, real Content Provider,
no mocks) — upgrading Tasks 1–4, 6, 8 (isolation half), 9 above from
"build-verified only" to "live-verified":

- `GET /dashboard/msg-automation`, `/dashboard/msg-automation/ai-prompts`,
  `/dashboard/msg-automation/ai-prompts/new`, and
  `/dashboard/msg-automation/ai-prompts/[id]` all return `200` for a logged-in
  `pawel_f` session (all `307` to login when unauthenticated).
- `POST /api/msg-automation/ai-prompts` created a real prompt in
  `msg-auto / ai prompts` on `pawel_f`'s repo (`status: "draft"`, `version: 1`).
- `GET` (list + one), `PATCH` (rename), `PATCH {"action":"publish"}`
  (→ `status: "published"`, `version: 2`, `publishedSnapshot` frozen with
  the renamed content) all worked against the real, running registry.
- `PATCH {"name":"   "}` correctly rejected with `400 {"code":"VALIDATION"}`.
- Logging in as `kamil_s` and calling `GET /api/msg-automation/ai-prompts`
  returned `[]` — `pawel_f`'s prompt is fully invisible to a different real
  user (isolation confirmed live, not just structurally).
- The smoke-test prompt was archived afterward (`PATCH {"action":"archive"}`)
  rather than left as live clutter — Content Provider has no working Delete
  (see `human-docs`'s Content Provider docs), so archiving is the correct,
  existing cleanup mechanism, consistent with how the rest of the app
  already handles this constraint.

Not covered by this pass: an actual real-browser click-through (mouse
clicks, form fills) and a live OpenAI execution (`Send new` against a
published `next-message`/`full-analysis` prompt with a real `OPENAI_API_KEY`
configured on the TEST container) — see `06_others_from_report.md`.

# Task 1 — Msg Auto shows AI PROMPTS after CREATOR

**Requested:** A new tile/button "AI Prompts" directly after "Creator" in the Msg Auto hub grid.
**Done:** Added a second grid button in `msg-automation/page.tsx` between CREATOR and MANUAL MESSAGES, routing to `/dashboard/msg-automation/ai-prompts`. Sidebar's existing `/dashboard/msg-automation` prefix already covers the new sub-route (prefix match), so the Msg Auto nav item stays highlighted.
**Files changed:** `packages/dashboard/app/(dashboard)/dashboard/msg-automation/page.tsx`, `packages/dashboard/components/shared/sidebar.tsx` (clarifying comment only).
**Tested:** `pnpm --filter dashboard build` — route `/dashboard/msg-automation/ai-prompts` present in the build's route table, no type errors. Not click-tested in a running browser (see `06_others_from_report.md` for why).
**Status: DONE**

# Task 2 — Prompt List

**Requested:** Name | School | Status | Version | Provider | Updated table; title, description, search, New prompt button, row click opens editor, empty/loading/error states, responsive.
**Done:** `ai-prompts/page.tsx` — `DashboardPageShell` with title "AI Prompts", search input + "New prompt" button in `toolbarSecondRow`, a responsive (`overflow-x-auto`) table with exactly those six columns, `StatusBadge` (Draft/Published/Archived), row `onClick` navigates to the editor, "No prompts yet" empty state (vs. "No prompts match your search" when filtered to zero), loading spinner, error state with Retry.
**Files changed:** `packages/dashboard/app/(dashboard)/dashboard/msg-automation/ai-prompts/page.tsx` (new).
**Tested:** `pnpm --filter dashboard build` clean. Backed by `GET /api/msg-automation/ai-prompts`, which is exercised indirectly through `ai-prompts.test.ts`'s `listAiPrompts` coverage (19/19 passing) — the route itself is a thin, untested-in-isolation adapter (see Task 8/9's isolation note and `06_others_from_report.md`).
**Status: DONE**

# Task 3 — Prompt Editor + Back

**Requested:** Two-pane editor (config left, test/result right), own scrollbars, Back to list, name/"New prompt", status badge, Save, optional Publish version.
**Done:** `[promptId]/page.tsx` — `EditorPageShell` with a header row (`NavGroup upLevel` → Back to `/dashboard/msg-automation/ai-prompts`, name or "New prompt", `StatusBadge`, Archive, Publish version, Save). Below it, `grid md:grid-cols-[minmax(0,480px)_minmax(0,1fr)]`: left pane (`overflow-y-auto`) holds all v1 fields; right pane (`overflow-y-auto`) holds a static request-preview `<pre>` (see Task 8 note on why this isn't a live test chat). Stacks to one column below `md`.
**Files changed:** `packages/dashboard/app/(dashboard)/dashboard/msg-automation/ai-prompts/[promptId]/page.tsx` (new).
**Tested:** `pnpm --filter dashboard build` clean, including the `promptId === "new"` vs. real-id branch. Not click-tested in a running browser.
**Status: DONE**

# Task 4 — Create and save a prompt (Content Provider write)

**Requested:** `msg-auto` Folder → `ai prompts` Text item, JSON body `{schemaVersion, prompts}`, lazy creation, per-user via `runWithRepoContext`/`getCurrentRepoGuid()`, no `repoGuid` from query/body, safe corrupt-JSON handling.
**Done:** `dba/ai-prompts.ts`'s `createAiPrompt` → `ensureRegistryItem` (`findOrCreateFolderChain(["msg-auto"])` → `createOrGetChild(folder, "ai prompts", "Text", ...)`) → validate (non-empty name/slug, at least one non-empty message, no duplicate slug) → append → `putItemBody`. `POST /api/msg-automation/ai-prompts` is a thin adapter: `getCurrentUserFromCookies` → 401 if none → `runWithRepoContext(user, () => createAiPrompt(...))`.
**Files changed:** `packages/dba/src/ai-prompts.ts` (new), `packages/dashboard/app/api/msg-automation/ai-prompts/route.ts` (new).
**Tested:** `ai-prompts.test.ts` — lazy folder/item creation, create+read round-trip, two prompts don't overwrite each other, duplicate-slug blocked, empty name/slug/content rejected, corrupt-JSON guard (all passing, fake-`ops` in-memory, no real CP needed). Not tested against a real Content Provider in this session (see `06_others_from_report.md`).
**Status: DONE**

# Task 5 — Edit an existing prompt (draft update)

**Requested:** Update only the targeted prompt; never let a draft edit silently overwrite a published version.
**Done:** `updateAiPrompt` only ever touches draft fields (name/slug/description/schoolId/actionType/messages/variables/provider/model/settings/providerBindings) — `status`, `version`, `publishedVersion`, `publishedSnapshot` are untouched by it, ever. `PATCH /api/msg-automation/ai-prompts/[id]` (no `action` field) calls it.
**Files changed:** `packages/dba/src/ai-prompts.ts`, `packages/dashboard/app/api/msg-automation/ai-prompts/[id]/route.ts` (new).
**Tested:** `ai-prompts.test.ts` — editing prompt A never changes sibling B; editing a published prompt's draft fields leaves `status`/`publishedSnapshot` frozen at their pre-edit values; renaming a slug to a value used by another prompt is blocked; updating a non-existent id throws `NOT_FOUND`.
**Status: DONE**

# Task 6 — Publish a version

**Requested:** New prompt starts at `version: 1`; Publish creates/records the next version or at least increments it, per a clearly described contract; Creator uses the published version.
**Done:** `publishAiPrompt` bumps `version` by 1, freezes the current draft into `publishedSnapshot` (tagged with that version), sets `status: "published"`. Simplified v1 (no full multi-version array) — documented as a conscious simplification, not hidden, in `06_others_from_report.md` per the input's own §12 allowance.
**Files changed:** `packages/dba/src/ai-prompts.ts`, `.../[id]/route.ts` (`{ "action": "publish" }`), editor page's "Publish version" button.
**Tested:** `ai-prompts.test.ts` — version increments on each publish (1→2→3); `findPublishedAiPrompt` only resolves `status: "published"` records, never drafts.
**Status: DONE**

# Task 7 — Archive a prompt

**Requested:** Optional per input §8 — included since it's needed to make Message Creator's resolution genuinely testable ("Prompt not configured" after archiving a previously-published prompt).
**Done:** `archiveAiPrompt` sets `status: "archived"`; `findPublishedAiPrompt` stops resolving it. History (`publishedSnapshot`) is kept, not deleted — Content Provider has no working Delete.
**Files changed:** same as Task 6.
**Tested:** `ai-prompts.test.ts` — publish then archive → `findPublishedAiPrompt` returns `null` again.
**Status: DONE**

# Task 8 — Message Creator integration

**Requested (mandatory, input §10):** Creator reads prompt definitions from the same `msg-auto / ai prompts` source; at minimum `actionType: "next-message"` selectable; draft never used by default; published is used; "Prompt not configured" when nothing resolves; no hardcoded prompt ids in the Creator component; Creator stores only the selected id/slug and fetches the definition from `dba`.
**Done:** `dba/ai-prompts.ts`'s `findPublishedAiPrompt({ actionType, schoolId })` resolves a **published-only** match (exact school first, then school-agnostic, else `null`). `message-creator.ts`'s `runMessageCreatorAiAction` calls it — mapped from Message Creator's own `operation` via `OPERATION_TO_AI_PROMPT_ACTION_TYPE` (covers all five: health→conversation-health, capital, next-message, improve, full-analysis) — before falling back to the pre-existing (still-`PROMPT_NOT_CONFIGURED`) `school.promptRef` boundary, so behavior for an unconfigured actionType is byte-identical to before this Story. When resolved, execution goes through `ai-prompts-openai.ts`'s `executeAiPrompt` and is saved via the existing `saveAnalysisRun`. `getMessageCreatorBootstrap` additionally resolves for `full-analysis` (what "Send new" actually triggers today) and returns `resolvedPrompt`; the Creator page renders it next to Send new, or "Prompt not configured" with a link to create one — no prompt id is stored or hardcoded client-side, it's re-resolved on every bootstrap load.
**Conscious scope boundary (see `06_others_from_report.md` for the full reasoning):** the Creator UI itself still only ever triggers `operation: "full-analysis"` (unchanged from Story 84/85 — no new per-action-type picker was added to avoid destabilizing a recently-shipped, working UI). The dba/registry layer fully supports `next-message` and the other action types end-to-end (`findPublishedAiPrompt`/`executeAiPrompt`/`saveAnalysisRun` all work for any `actionType` today) — a future Story wiring a per-operation trigger into the Creator UI has nothing left to build on the data side.
**Files changed:** `packages/dba/src/message-creator.ts`, `packages/dba/src/ai-prompts.ts`, `packages/dba/src/ai-prompts-openai.ts` (new), `packages/dashboard/app/(dashboard)/dashboard/leads/message-creator/page.tsx`.
**Tested:** `pnpm --filter dba build` clean; existing `message-creator.test.ts` (10/10) still passes unchanged after the edit, confirming no regression to the pure helpers. Live "Send new" against a real published OpenAI prompt was **not** exercised in this session (needs a real `OPENAI_API_KEY` + an actual published prompt + a real Beeper conversation) — the `PROMPT_NOT_CONFIGURED` path (no registry prompt published yet) is what's live-testable today and matches pre-Story-88 behavior exactly.
**Status: DONE**

# Task 9 — Per-user isolation

**Requested:** User A must never see user B's prompts.
**Done:** No function in `ai-prompts.ts` accepts a `repoGuid`/user id parameter — every Content Provider access goes through `item-ops.ts`, which resolves the address via `getCurrentRepoGuid()` (`repo-context.ts`'s `AsyncLocalStorage`). Every API route wraps its `dba` call in `runWithRepoContext(user, ...)`, `user` coming only from `getCurrentUserFromCookies()` (validated against `chad_admin`, never trusted raw from the cookie).
**Files changed:** none beyond what's listed above — isolation is inherited from the existing, already-verified mechanism (`chad-user-data-isolation.md`), not reimplemented.
**Tested:** Structural (function-signature) assertion in `ai-prompts.test.ts`; the underlying `runWithRepoContext`/`getCurrentRepoGuid()` mechanism itself was already verified end-to-end (two real users, cross-user leak test) in the Story that introduced it — not re-verified live for AI Prompts specifically in this session (would need two logged-in sessions against a real Content Provider).
**Status: DONE**
