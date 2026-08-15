# Story 120 — Plan

Starting point commit: `4df7914` (HEAD before this Story's own changes;
`4df7914` itself is a baseline checkpoint of pre-existing, unrelated cp_1
Finder-sidebar changes found in the working tree, committed separately per
the mandatory-return-point rule before any Story 120 edits began).

## Reference audit (done before writing this plan)

- `dashboard-history-provider.tsx` (current): RAM-only stack, `MAX_BACK = 5`,
  detects Back/Forward purely by URL-equality against `entries[index±1]` —
  the exact bug the input calls out: a fresh `A → B → A` push is
  indistinguishable from a real Back to the earlier `A`.
- `nav-group.tsx`: already correct — "shared history first, else `upLevel`"
  — needs **no changes**.
- `folders/page.tsx`: local `nav.items/nav.index` stack (`pushItem`/
  `replaceCurrentItem`/`goBack`/`goForward`), never touches the URL at all.
  `pushItem` vs `replaceCurrentItem` call sites already encode the correct
  "identity change vs same-item mutation" split (child click/GO/repo
  change/move-success/delete-success → `pushItem`; Save body/config/create
  child/import/drag-move refresh → `replaceCurrentItem`) — this mapping
  carries over 1:1 to `navigateToCpItem` (push) vs plain `setCurrentItem`
  (replace-in-place, no router call) in the new design.
- Story 119's CP-link (`cp-link-text.tsx`, `/api/cp-items/[id]`,
  `resolveCpItemByIdForUser` in `dba`): click → fetch → `window.location.href`
  to `/dashboard/folders?repoGuid=&loca=`. Parser (`lib/preview/cp-link.ts`)
  stays untouched per the input's explicit instruction — only the rendered
  link and the target URL shape change.
- Knowledge (`knowledge/[category]/[[...path]]/page.tsx`) already has full
  URL identity (catch-all dynamic route) and already navigates via real
  `<Link href>` — Task 1.13 needs no code change there, just confirmation
  (done) that shared history sees it as ordinary distinct URLs, which it
  does automatically once the provider itself is fixed.
- `DashboardPageShell` always renders `NavGroup` — Folders already gets
  shared Back/Forw in its toolbar row; the competing history is the
  page's own extra `Wstecz`/`GO`/`Naprzód` buttons inside the content frame.

## Design

1. **`lib/cp-address/route-codec.ts`** (dashboard) — pure, tested:
   `cpAddressToRouteSlug`, `cpRouteSlugToAddress`, `cpAddressToFoldersHref`.
   Encoding relies on the UUID's fixed 36-char canonical form (no naive
   `replaceAll("-", "/")`): slug = `<36-char-uuid>` + (`-` + digit-only loca
   segments joined by `-`) if any. Decode slices the first 36 chars,
   validates as UUID, then splits the remainder on `-` and validates every
   segment as `^[0-9]+$` (rejects traversal/injection by construction — a
   segment with `.`, `/`, letters, etc. never matches).

2. **`/dashboard/folders/[slug]/page.tsx`** — `export { default } from
   "../page"` (no component duplication). `folders/page.tsx`'s component
   stops reading `params`/relying on being mounted once at a fixed route;
   it reads the current slug reactively from `usePathname()`, so the exact
   same component instance serves both the base and the slugged route and
   reacts correctly to `router.push`/`router.replace`/browser back-forward
   alike.

3. **`/dashboard/folders/by-id/[id]/page.tsx`** — real server-rendered
   route (Task 1.14's "internal real route" option): validates the UUID,
   resolves it via the existing `resolveCpItemByIdForUser`, and
   `redirect()`s to the canonical `/dashboard/folders/<slug>` href, or
   renders a controlled "not found/not accessible" state. `cp-link-text.tsx`
   becomes a plain `<Link href="/dashboard/folders/by-id/<uuid>">` — a real
   anchor known at render time, no click handler, no `window.location`.

4. **`lib/local-storage-safe.ts`** — tiny SSR-safe get/set/remove helper.
   **`lib/cp-address/last-address-store.ts`** — `getLastCpAddress`/
   `setLastCpAddress`/`clearLastCpAddress(username, repoGuid)`, key
   `chad:folders:lastAddress:<username>:<repoGuid>` — scoped by both
   (not just `repoGuid`) because the shared `chad_shared` repoGuid is the
   same value for every user, so `repoGuid` alone would mix users' last
   addresses on a shared browser profile. `username` comes from the
   existing `/api/folders` response (already returns it, previously
   unused) — no new endpoint.

5. **`folders/page.tsx` rewrite (surgical, not a rebuild)**:
   - Replace `nav: {items, index}` with `currentItem` + a much smaller
     `ancestorNamePath: string[]` (kept **only** for the pre-existing
     system-folder read-only banner, which needs a root→current name
     trail; this is a local cache, not a history mechanism — allowed by
     the input's own §3.7). Appends on child-click, resets to `[]` on any
     other kind of jump (GO/deep-link/CP-link/repo-change/parent-after-
     move-or-delete) — matches the *existing* deep-link gap already
     present in Story 119's code (a deep-linked item already showed an
     empty breadcrumb), so this is not a regression, just now consistent.
   - Remove the local `Wstecz`/`Naprzód` buttons and `goBack`/`goForward`
     — `NavGroup` (already rendered by `DashboardPageShell`) is the only
     Back/Forward affordance left. `GO` stays (structural jump-to-address,
     not a history mechanism).
   - New single `navigateToCpItem(item, { mode })` helper: `mode: "push"`
     (default) for every real identity change, `mode: "replace"` only for
     the base-route → canonical-slug redirect on load. Every existing
     `pushItem(...)` call site becomes `navigateToCpItem(item)`; every
     `replaceCurrentItem(...)` call site becomes a plain `setCurrentItem`
     (no router call — same item, no new/replaced URL).
   - Mount logic: read `usePathname()`; if it has a slug, decode via
     `cpRouteSlugToAddress` and fetch that address directly (no root fetch
     first — Task 3.4). If decode fails or the fetch 404s/403s, render a
     controlled not-found state (URL is source of truth; a bad slug must
     not silently redirect to a different item). If there is no slug (base
     route), try `getLastCpAddress`; on success fetch it, on failure clear
     the stale entry and fall back to the repo root; either way finish with
     `navigateToCpItem(item, { mode: "replace" })` so the bare `/folders`
     entry never survives as its own step.

6. **`dashboard-history-provider.tsx` redesign** — logic extracted into a
   pure, unit-tested reducer, `lib/dashboard-history-reducer.ts`
   (`applyHistoryUrlChange(state, {url, wasPopState, wasReplace})`):
   - `wasPopState` (set from a native `popstate` listener) is the
     unambiguous "this URL change came from real session-history
     navigation" signal `pushState`/`replaceState` never fire — used both
     for the browser's own Back/Forward buttons and for our own
     `goBack`/`goForward`, which now call `router.back()`/`router.forward()`
     instead of re-pushing a remembered URL, so they're the *same*
     mechanism as the browser buttons (Task 1.15) by construction, not by
     synchronization.
   - `wasReplace` is an explicit opt-in (`notifyReplace()` on the context,
     called immediately before a `router.replace(...)` that canonicalizes
     the *current* entry) — mutates `entries[index]` in place instead of
     appending. Chosen over guessing push-vs-replace from the URL alone
     because Next gives no observable signal for it; kept deliberately
     narrow (only Folders' base-route canonicalization calls it) so
     pre-existing `router.replace` call sites elsewhere in the dashboard
     (Beeper/multiview/msg-workout/ai-prompts pages) keep their current,
     already-accepted behavior unchanged — no risk to unrelated features.
   - Neither flag set → ordinary push: truncate any forward stack, append,
     cap the back portion at `MAX_BACK = 30` (raises from 5; comfortably
     above the required 20). A fresh push to a URL that happens to equal
     an existing entry (`A → B → A`) is never mistaken for Back, because
     that classification only ever happens under `wasPopState`.
   - `wasPopState` with no adjacent match in our own tracked window (real
     browser history reaches further back/forward than our capped stack,
     e.g. after a refresh) resyncs to a fresh single-entry stack at the
     observed URL instead of guessing — degrades gracefully, never fights
     the browser.

7. **Docs**: update `documentation/dashboard/folders/features/` (create if
   absent) and the CP-link note in Story 119's area with the new
   contract — done as part of Task write-ups in `05_tasks_and_checklist.md`
   plus a short standing feature doc, not a separate large document.

## Explicit push/replace decision (Task 1.17, documented per instruction)

- Any navigation to a **different** CP Item (child click, GO, CP-link,
  repo change, deep link, move/delete landing on the parent) = **push**.
- The **only** replace is the bare `/dashboard/folders` → resolved
  `/dashboard/folders/<slug>` canonicalization right after mount, via the
  new `notifyReplace()` opt-in — chosen specifically so a plain visit to
  the base route never leaves an inert, un-back-able empty step in the
  shared history stack.

## Out of scope / consciously not touched

- `packages/net-content-provider`, Knowledge's own slug resolver — no
  changes needed (Task 1.13 already satisfied there).
- Pre-existing `router.replace` call sites in Beeper/multiview/msg-workout/
  ai-prompts pages — left exactly as they behave today (see §6 above).
- No PROD deploy, no push, per the input's own boundaries.
