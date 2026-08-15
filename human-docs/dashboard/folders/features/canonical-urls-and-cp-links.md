# Folders — canonical address URLs & the shared Preview's CP-link

Story 120 (2026-08-13), continuing Story 119 (`[UUID]` → CP Item links in
the shared Preview).

## Identity model

- **CP-link source identity = stable `CpItem.id` (UUID).** The shared
  Preview's `[uuid]` marker (`packages/dashboard/lib/preview/cp-link.ts` —
  unchanged by this Story) always stores the id, never an address, so a
  `Move` never breaks the link.
- **Folders canonical URL identity = current CP address.** The URL is the
  source of truth for which item Folders shows — not React state, not
  `localStorage`.
- **`localStorage` = fallback "last visited address" only**, scoped by
  `username` + `repoGuid` (not `repoGuid` alone — the shared `chad_shared`
  repo has the same `repoGuid` for every user, so scoping by `repoGuid`
  alone would mix different users' last addresses on a shared browser
  profile). Never a source of authorization; every address read back from
  it is re-validated by the normal `/api/folders` session/repo access
  check.

## Canonical route

`/dashboard/folders/<address-slug>` — `packages/dashboard/lib/cp-address/route-codec.ts`:

- `cpAddressToRouteSlug` / `cpRouteSlugToAddress` / `cpAddressToFoldersHref`
  / `cpAddressRepoGuid` — one shared, unit-tested codec. Not a naive
  `slug.replaceAll("-", "/")` (the UUID itself has hyphens): the first 36
  characters of a slug are always the repoGuid (validated as a canonical
  UUID), the rest is `-`-joined numeric loca segments (CP's own numeric
  child indices), each validated as digits-only — rejects path traversal
  and injection by construction.
- `/dashboard/folders` (no slug) and `/dashboard/folders/<slug>` are served
  by the SAME component — but it lives in `app/(dashboard)/dashboard/folders/layout.tsx`,
  not `page.tsx`. `page.tsx` and `[slug]/page.tsx` are both trivial `return
  null` leaves. This was a live correction during the Story: a plain
  `page.tsx` re-export remounts on every `[slug]` value change (Next's App
  Router treats a different dynamic-segment value as a different Server
  Component boundary), which silently reset every piece of local state that
  isn't derived from the URL — discovered because the structural Wstecz/
  Naprzod redo stack (below) kept getting wiped after every single Wstecz
  click even though the URL/content itself always resolved correctly (that
  part re-derives from the URL on every mount, so the bug was invisible
  there). A `layout.tsx` is exactly the part of the route tree Next
  guarantees stays mounted across navigation within the same subtree — the
  root-cause fix, not a workaround. The component reads the current slug
  reactively from `usePathname()`, not a route `params` prop, so it
  correctly reacts to this page's own `router.push`/`router.replace` calls
  AND to browser/NavGroup Back-Forward landing on a different slug.

### Resolution priority (base route, no slug)

1. This user+repo's `localStorage` last address.
2. The repo root, if the last address is missing/stale/deleted/forbidden
   (the stale entry is cleared, not left behind).

Either way, the bare `/dashboard/folders` URL is immediately
**canonicalized** to `/dashboard/folders/<slug>` via `router.replace` +
`DashboardHistoryProvider`'s `notifyReplace()` (see the shared-navigation
doc) — so a plain visit to the base route never leaves a dead, un-Back-able
step in the shared history stack.

### Resolution priority (slug present)

The slug is the sole source of truth. An invalid/undecodable/forbidden
slug renders a controlled not-found state in place — it does NOT silently
fall back to a different item (that would be surprising for a bookmark,
shared link, or a freshly opened tab).

## `navigateToCpItem` — the one place identity changes go through

Every real "current item changed" event (child click, GO, repo switch,
CP-link landing, Move/Delete navigating to the parent) calls this single
helper, which pushes the canonical URL AND persists the new `lastAddress`.
A same-item mutation (Save body/config, create-child refresh, drag-move
refresh) calls plain `setCurrentItem` instead — no router call, no new
history entry. This mirrors exactly the same split the pre-existing code
already had between `pushItem` (identity change) and `replaceCurrentItem`
(same-item mutation) — only the mechanism changed, not which call sites do
which.

Folders no longer keeps its own competing *visited-order* history stack —
the previous local `nav.items`/`nav.index` array is gone; `NavGroup`'s
shared Back/Forward (see the shared-navigation doc) is the cross-page
history. The "Wstecz"/"Naprzód" buttons around GO are kept, but as a
**different, structural** control, not a history replay: Wstecz strips the
current item's last loca segment (`14/07/02/01` → `14/07/02`, a file-browser
"up one level"), pushing the stripped segment onto `strippedLocaSegments` —
a real undo/redo stack, not a single slot. N consecutive Wstecz clicks push
N segments; N consecutive Naprzód clicks pop them in order, retracing the
exact same path back down. The stack needs no branching/clearing logic on
Wstecz itself — a Naprzód always restores exactly the loca state a matching
Wstecz produced, so a fresh Wstecz from there reproduces the same stack it
would have had. Any OTHER navigation (child click, GO, CP-link, repo
change, move/delete) clears the whole stack via `navigateToCpItem`'s own
default. Every step through them still calls `navigateToCpItem`, so the
URL updates and the shared history observes it like any other navigation —
this is not a second competing history, just an address-tree shortcut on
top of the same URL-driven mechanism. A small local `ancestorNamePath`
cache also remains (root→current `Config.name` trail) — it's only used for
the pre-existing system-folder read-only banner, which matches by logical
name path, not by numeric address; it is not a history mechanism either.

## The CP-link itself — opens Item View or Knowledge, by target type

`components/shared/cp-link-text.tsx` is a real `<Link href="/dashboard/item-view/by-id/<uuid>">`
— not a styled button with an `onClick` → fetch → navigate handler. Native
browser link behavior (right-click → "Open Link in New Tab", Cmd/Ctrl-click,
middle-click) all work because the `href` exists before any click, unlike
the original Story 119 version's `window.location.href` assignment inside a
click handler. Plain left-click ALSO opens a new tab (`target="_blank"
rel="noopener noreferrer"`) — a live clarification during this Story: a
CP-link is a quick side-reference, not meant to replace the current view.

`/dashboard/item-view/by-id/[id]/page.tsx` is the real, authorizing target:
validates the UUID, resolves it via the pre-existing `resolveCpItemByIdForUser`
(scoped to exactly the repos the session may browse — now also returns
`type`), and `redirect()`s **by the target's type**:

- **Text** → `/dashboard/item-view/<slug>` (see below).
- **Folder** → `/dashboard/knowledge/<slug>` (see below) — a live
  clarification during this Story: a Folder CP-link should land in
  Knowledge's own card-grid view ("that nice view"), never Item View.

...or renders a controlled "not found/not accessible" state. This route
used to live at `/dashboard/folders/by-id/[id]` and always redirect into
the full Folders browsing GUI — moved once Item View/Knowledge address mode
existed, since a CP-link opening the full Add/Delete/Move Folders chrome
was never the intent. `GET /api/cp-items/[id]` (Story 119's click-time
fetch endpoint) was removed as dead code once nothing called it anymore.

## Item View — chrome-free single Text-item view

`/dashboard/item-view/<address-slug>/page.tsx` — the same idea as opening a
Knowledge document (`DashboardPageShell` + `TextEditorWithToolbar`, no
Add/Delete/Move/repo-picker/Loca-input browsing chrome), generalized to any
CP Text address, not only ones reachable through the Knowledge menu tree.
Reads/writes through the exact same `/api/folders` GET/PUT the Folders tab
already uses — no new authorization surface. Shows only the title + editor;
no `Address:`/`item-id:` header (removed per a live clarification — Item
View is meant to read like a plain document, not a debug panel). A Folder
address landing here (stale link after a Move, manual URL edit) redirects
to the equivalent `/dashboard/knowledge/<slug>` instead of rendering — kept
symmetric with the by-id route's own type-based redirect.

## Knowledge — now also address-based, alongside its existing name-slug browsing

`app/(dashboard)/dashboard/knowledge/[category]/[[...path]]/page.tsx` two
modes, in the SAME file (a live Story 120 follow-up — a genuine second
route would collide with `[[...path]]`'s catch-all, since `/dashboard/knowledge/<anything>`
with no further path already matches `category` alone):

- **Name mode** (original, Story 96/109/114): `category`/`path` are
  human-readable name-slugs, resolved via `/api/knowledge/[category]/[[...path]]`.
  Completely unchanged — the bare `/dashboard/knowledge` menu (category
  tiles) still lands here for browsing.
- **Address mode** (new): when `category` (with no further `path`) parses
  as a canonical CP address slug (`cpRouteSlugToParts` — a category
  name-slug is short and human-readable, so it can never accidentally match
  the strict 36-char-UUID-prefixed format), data comes from `/api/folders`
  instead, for ANY CP Folder address, not only ones organized under the
  Knowledge menu tree. A Text address landing here redirects to Item View
  (symmetric with Item View's own Folder→Knowledge redirect). Card/row
  hrefs in this mode point at `/dashboard/knowledge/<childSlug>` (Folder
  children) or `/dashboard/item-view/<childSlug>` (Text children) instead
  of the name-based `knowledgePageHref`.
- The Knowledge menu's own category tiles (`app/(dashboard)/dashboard/knowledge/page.tsx`)
  now link via address mode too (`cpAddressToKnowledgeHref(category.address)`),
  so `/api/knowledge`'s `listKnowledgeCategories()` (`packages/dba/src/knowledge.ts`)
  gained an additive `address` field on each category summary — Story 96's
  original design deliberately never sent a CP address to the client; no
  longer load-bearing now that addresses are already in URLs throughout the
  dashboard (Folders, Item View, CP-links).
- `/api/folders`'s response gained an additive `ChildrenDetailed` field
  (`packages/dashboard/lib/folders-api.ts`) — `{index, name, type}[]`
  alongside the pre-existing `Body` index→name map, so address-mode
  Knowledge can tell a Folder child from a Text child (needed to split the
  card grid into folder-cards vs. loose-document rows) without an extra
  request per child. `Body` itself is untouched, so every existing consumer
  (Folders' own child-row rendering) is unaffected.
- A Text row anywhere in the Knowledge grid (`components/shared/knowledge-grid-row.tsx`)
  now opens in a **new tab** by default (`target="_blank"`, both name mode
  and address mode) — a live clarification: clicking a document used to
  navigate the browsing tab away from the folder grid entirely ("wypadamy z
  knowledge"). A Folder row/card title stays a normal same-tab link — the
  whole point is staying in Knowledge's own view for Folder items.

`DashboardHistoryProvider`'s fix (see the shared-navigation doc) makes
`Knowledge doc → CP-link → Back` land on the exact Knowledge document
regardless of mode.
