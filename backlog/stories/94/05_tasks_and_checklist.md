# Story 94 — Tasks Checklist

| # | Ai Status | Real Status | Task |
|---|-----------|-------------|------|
| 1 | DONE | | Rename Beeper's "All" tab to "Conversations" (no third tab; Permissions unchanged) |
| 2 | DONE | | Conversations tab shows a two-pane split view: contact list, thin separator with a collapse/expand handle, conversation |
| 3 | DONE | | Selecting a contact loads its conversation inline — never navigates to `/dashboard/beeper/[id]` |
| 4 | DONE | | Collapse/expand handle works (ChevronLeft/Right, correct aria-labels), conversation panel expands when list is collapsed |
| 5 | DONE | | No banned strings anywhere in the Conversations view ("Select a conversation", "Select a lead...", "WhatsApp conversation", extra "Conversations" header, contact-count badge, empty-state icon/copy) |
| 6 | DONE | | Empty right panel (no selection, or selection with zero messages) renders as bare empty space, not the shared renderer's own icon+text state |
| 7 | DONE | | Responsive: mobile shows one panel at a time (list fullscreen, then conversation fullscreen with a small back button); desktop/tablet show both panels side by side |
| 8 | DONE | | Permissions tab has zero regressions (Include/Exclude, filter, Search, table) after being switched between tabs |

# Task 1 — Rename "All" → "Conversations"

**Requested:** Replace the "All" tab label/value with "Conversations"; no third tab; Permissions stays functionally unchanged.
**Done:** `ViewTab` type and `VIEW_OPTIONS` in `packages/dashboard/app/(dashboard)/dashboard/beeper/page.tsx` now use `"permissions" | "conversations"` with labels "Permissions"/"Conversations". Permissions rendering extracted 1:1 (same fetch/patch logic, same markup) into `components/beeper/beeper-permissions-view.tsx` — no behavior change.
**Files changed:** `packages/dashboard/app/(dashboard)/dashboard/beeper/page.tsx`, `packages/dashboard/components/beeper/beeper-permissions-view.tsx` (new).
**Tested:** Browser (local Docker, dark mode, 1440px): tab reads "Conversations", Permissions tab shows 157 real contacts with Include/Exclude/filter/Search/table exactly as before.
**Status: DONE**

# Task 2 — Split view (list | handle | conversation)

**Requested:** Two-pane layout: left contact list, thin full-height separator with a small handle, right conversation panel.
**Done:** New `components/beeper/beeper-conversations-view.tsx` renders `<aside>` (list) + `BeeperSplitHandle` + `<section>` (conversation) in a flex row (not a rigid grid, so the aside can animate to 0 width). Left panel: `beeper-conversation-list.tsx` (compact search + scrollable rows, own `overflow-y-auto`). Right panel: existing `BeeperConversationView` shared renderer fed pre-parsed messages.
**Files changed:** `components/beeper/beeper-conversations-view.tsx`, `beeper-conversation-list.tsx`, `beeper-split-handle.tsx`, `beeper-conversations-logic.ts` (all new).
**Tested:** Browser — list has its own scroll, conversation has its own scroll, no whole-page scroll (`DashboardPageShell scroll={false}` for the Conversations tab).
**Status: DONE**

# Task 3 — No navigation to detail page

**Requested:** Clicking a contact must load the conversation inline, not open `/dashboard/beeper/[id]`.
**Done:** Contact rows are `<button>` elements (not `next/link`), `onClick` calls `selectContact(id)` which fetches `/api/beeper-crm/contacts/${id}` and stores the result in state — no router navigation.
**Files changed:** `beeper-conversation-list.tsx`, `beeper-conversations-view.tsx`.
**Tested:** Browser — clicked "Dominika Nikola Gałecka" after "Karolina"; `Page URL` stayed `http://localhost:12020/dashboard/beeper` in both the Playwright navigation log and a direct `location` check; conversation content changed to Dominika's messages (verified different timestamps/text).
**Status: DONE**

# Task 4 — Collapse/expand handle

**Requested:** Small centered handle on the separator; ChevronLeft when expanded, ChevronRight when collapsed; correct aria-labels; keyboard accessible; conversation expands when list collapses.
**Done:** `beeper-split-handle.tsx` + pure `splitHandleProps()` in `beeper-conversations-logic.ts` derive icon/aria-label from `isListCollapsed`. It's a real `<button>` (focusable, Enter/Space work natively), `focus-visible:ring` styling.
**Files changed:** `beeper-split-handle.tsx`, `beeper-conversations-logic.ts` (+ `.test.ts`).
**Tested:** Unit tests (`beeper-conversations-logic.test.ts`, 8/8 pass) for both states. Browser: clicked "Collapse conversation list" → button re-rendered as "Expand conversation list" (confirmed via `browser_find`); clicked again → back to "Collapse conversation list"; conversation content stayed visible/unaffected throughout.
**Status: DONE**

# Task 5 — No banned strings

**Requested:** None of: "Select a conversation", "Select a lead from the list to view messages", "WhatsApp conversation", an extra "Conversations" panel header, a contact-count badge, empty-state icons/instructions/large placeholders/info cards.
**Done:** Conversations tab has no panel header beyond the tab label itself; no count badge (that's Permissions-only, in `beeper-permissions-view.tsx`); the shared `BeeperConversationView` is only mounted when there are messages to show (see Task 6), so its own built-in icon+text empty state never renders here.
**Files changed:** (verification only, no extra files.)
**Tested:** `page.evaluate(() => document.body.innerText)` on the Conversations tab with no contact selected: none of the banned phrases present; `document.querySelector('section').innerHTML.length === 26` (just the bare empty div); no "N contacts" badge regex match anywhere on the page.
**Status: DONE**

# Task 6 — Empty state = bare empty space

**Requested:** No selection, or a selected contact with zero messages → empty space, not the shared renderer's icon+text state.
**Done:** `shouldRenderConversation(selectedContactId, messageCount)` (pure, unit-tested) gates whether `<BeeperConversationView>` mounts at all; otherwise a bare `<div className="h-full" />` renders.
**Files changed:** `beeper-conversations-logic.ts` (+`.test.ts`), `beeper-conversations-view.tsx`.
**Tested:** Unit tests (both "no selection" and "selected but empty" cases assert `false`). Browser: fresh Conversations tab with no selection → confirmed 26-char empty section (Task 5's check doubles as this one).
**Status: DONE**

# Task 7 — Responsive (mobile/tablet/desktop)

**Requested:** Desktop priority; mobile shows one panel at a time with a way back to the list; no two useless narrow columns.
**Done:** CSS-only (no viewport JS): aside is `hidden md:flex` once a contact is selected (mobile hides the list), section is `hidden md:block` until a contact is selected. A small mobile-only (`md:hidden`) back button (ChevronLeft, `aria-label="Back to conversation list"`) clears the selection to bring the list back. Desktop collapse toggle stays independent (`isListCollapsed`, `md:w-0`/`md:w-[300px]`).
**Files changed:** `beeper-conversations-view.tsx`.
**Tested:** Browser at 1440px (desktop), 820px (tablet — both panels visible, matches `md` breakpoint), and 390px (mobile): before selection, list full-width + conversation hidden (`display:none` confirmed via `getComputedStyle`); after selecting a contact, list hidden + conversation full-width + back button visible; clicking back restored the list. Dark mode screenshot confirmed visually clean at desktop and tablet widths.
**Status: DONE**

# Task 8 — Permissions has no regressions

**Requested:** Include/Exclude, filter, Search, table must keep working exactly as before, including after switching tabs.
**Done:** `beeper-permissions-view.tsx` is an unmodified extraction of the prior inline logic (same `fetch`/`PATCH` calls, same optimistic-update behavior, same table markup).
**Files changed:** `beeper-permissions-view.tsx` (new, extraction only).
**Tested:** Browser — Permissions tab still shows all 157 real contacts with working Include/Exclude checkboxes, "All/Include/Exclude/Permission" filter, Search box, and "Updated" column; switched Permissions → Conversations → Permissions repeatedly with no data/layout regression. Checkbox mutation itself was **not** exercised against real production data (per Story's data-safety rule against touching real Include/Exclude state) — the code path is byte-for-byte unchanged from before this Story, so this is a documentation/extraction risk only, not a new behavior.
**Status: DONE**

# TEST verification (QNAP TEST, `bash-scripts/dashboard/08_registry_test/deploy.sh`)

Deployed `chad-dashboard:260730_224509-8c54aad` to QNAP TEST (first attempt's
GHCR push hit a transient network timeout — built image never reached the
registry, QNAP was never touched; retried and the second attempt pushed and
deployed cleanly, confirmed via `docker compose ps`/health check in the
script's own output).

Logged in as **test2** and **test3** (per explicit instruction to use
throwaway accounts, password `changeme`) and re-ran the structural checks:

- Tabs read "Permissions"/"Conversations" — **PASS TEST**.
- Conversations split view renders correctly: `<aside>`/`<section>` present,
  handle labeled "Collapse conversation list" → "Expand conversation list"
  after a click — **PASS TEST**.
- No banned strings, no count badge, empty right panel is the bare 26-char
  `<div>` — **PASS TEST**.
- Permissions tab renders (Include/Exclude columns, filter, Search) with 0
  contacts for both accounts — **PASS TEST** (structure), consistent with
  Permissions' own "0 contacts"/"No contacts found" for the same accounts.
- **NOT independently re-verified on TEST:** real message-content rendering
  (contact selection swapping conversation content, no-navigation-on-click)
  and the Local-Mongo-readonly toggle — test2/test3 have **zero** synced
  Beeper contacts on TEST (their `beeper_<repoGuid>` databases are empty, an
  environment fact independent of this Story), so there is nothing to select
  or render. These exact behaviors **were** verified with real data on LOCAL
  (Task 3, `06_others_from_report.md`) against the real user's live Beeper
  database. Recorded here explicitly per the Story's honesty rule — this is
  a data-availability gap on TEST, not a skipped check.
