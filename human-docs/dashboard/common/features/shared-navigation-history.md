# Shared dashboard navigation history (`DashboardHistoryProvider` / `NavGroup`)

Story 120 (2026-08-13), rewriting Story 56's original `DashboardHistoryProvider`.

## What it is

One shared Back/Forward history for the whole dashboard, driven entirely by
the browser URL (`pathname` + full search params) — not by any single
page's own private state. `NavGroup` (rendered automatically by every
`DashboardPageShell`) is the one Back/Forward UI; there is no second,
competing history mechanism anywhere in the dashboard (see Folders below —
that used to be the exception).

- `packages/dashboard/components/shared/dashboard-history-provider.tsx` —
  the React provider: tracks the visited-URL stack, wires a native
  `popstate` listener, exposes `canGoBack`/`canGoForward`/`goBack`/
  `goForward`/`notifyReplace`.
- `packages/dashboard/lib/dashboard-history-reducer.ts` — the actual state
  transition logic, extracted as a **pure, unit-tested function**
  (`applyHistoryUrlChange`) so the trickiest case (telling a real
  Back/Forward apart from a fresh navigation that happens to land on a URL
  already in the stack) has a test, not just a heuristic.

## Why URL-equality alone doesn't work

The original implementation (MAX_BACK = 5) guessed Back/Forward purely by
comparing the new URL to the stack's neighboring entries. That misclassifies
a fresh `A → B → A` navigation (a real click/Link back to an earlier URL) as
a Back into the *existing* `A`, instead of recording a genuine third visit —
Back from that fresh `A` would then skip straight past `B`.

The fix: a native `popstate` event is the one signal the browser gives for
"session history actually moved" — `pushState`/`replaceState` (what
`router.push`/`router.replace` use) never fire it. So:

- **`wasPopState: true`** → a real Back/Forward (browser buttons, or our own
  `goBack`/`goForward`, which now call `router.back()`/`router.forward()`
  instead of re-pushing a remembered URL — they ARE the same mechanism as
  the browser's own buttons, not a synchronized copy of it). The reducer
  MOVES the stack index to the matching neighbor; it never appends.
- **no `wasPopState`, no `wasReplace`** → a genuinely new push. Truncates
  any forward stack, appends, caps the back portion at `MAX_BACK = 30`
  (raised from 5). `A → B → A` always records three entries.
- **`wasReplace: true`** → an explicit, opt-in signal (`notifyReplace()` on
  the provider, called immediately before `router.replace(...)`) that
  canonicalizes the CURRENT stack entry in place instead of appending.
  Deliberately narrow: only Folders' base-route → canonical-slug
  redirect (see the Folders doc) uses it. Every other pre-existing
  `router.replace` call site in the dashboard (Beeper, multiview,
  msg-workout, ai-prompts pages) is untouched and keeps behaving exactly as
  it did before this Story — they don't call `notifyReplace()`, so their
  replace navigations are still recorded as ordinary pushes, same as always.

If a real Back/Forward lands on a URL that isn't adjacent in our own
tracked (capped) window — e.g. the browser's actual history reaches further
than `MAX_BACK`, or a page refresh reset the in-RAM stack — the reducer
resyncs to a fresh single-entry stack at the observed URL instead of
guessing a position. The provider never fights real browser history and
never re-pushes a URL it just observed via `popstate`.

## `NavGroup`'s own Back precedence — unchanged

`nav-group.tsx` was already correct and needed no changes: `Back` prefers
the shared history first; only when there's no tracked previous entry
(e.g. a fresh deep link) does it fall back to the page's own declared
structural parent (`upLevel`). This is what makes `Knowledge doc → click a
CP-link → Back` land on the exact Knowledge document, not some structural
parent folder.

## Persistence

RAM-only, per browser tab (a page refresh clears it — the provider
remounts from scratch). This is deliberate — see Folders' own,
much narrower, `localStorage` "last visited address" below, which is a
completely different, smaller mechanism.
