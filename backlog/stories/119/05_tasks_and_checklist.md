# Story 119 — Tasks Checklist

| # | Ai Status | Real Status | Task |
|---|-----------|-------------|------|
| 1 | DONE      |             | Folders shows `item-id: <real CpItem.id>` directly under Address |
| 2 | DONE      |             | Folders' outer frame always wraps the full tree, no matter how long, without moving/cutting items |
| 3 | DONE      |             | Shared Preview: `[UUID]` above a `- ` line becomes a hidden-UUID link to that CP Item, in hdr1 and hdr2, in both Folders and Knowledge |
| 4 | DONE      |             | md format and existing hdr1/hdr2/headers-format semantics are unaffected (no regression) |

# Task 1 — Folders item-id

**Requested:** Under the existing Address line in Folders, show `item-id: <GUID>` — the real `CpItem.id`, never a generated UUID, never confused with address/loca/repo id.

**Done:** `Config.id` (== the real `cp_items.id` primary key) already flowed unchanged from the Postgres provider through `dba` and the `/api/folders` route to the frontend's own `CpConfig` type — it was simply never rendered. Added one line to the existing Address/Type/Name block.

**Files changed:** `packages/dashboard/app/(dashboard)/dashboard/folders/page.tsx`

**Tested:** Live against the rebuilt local Docker dashboard (Playwright): repo root shows `item-id: 21d11bdc-f1f4-44d1-b61a-3fa6b039c641` (matches the repo's own known GUID); a child Folder and a Text item each show their own distinct, real `cp_items.id`.

**Status: DONE**

# Task 2 — Folders outer frame

**Requested:** Fix only the outer frame's geometry so it always wraps the full tree on a long list, without moving/reordering/cutting items, and without a giant `min-height` hack.

**Done:** Root cause: `folders/page.tsx`'s own nested `rounded-lg border` wrapper div sets `min-h-full` while remaining a default-`flex-shrink: 1` flex item of `DashboardPageShell`'s scroll container. `min-height: 100%` overrides the flex item's implicit `min-height: auto`, which is what normally stops a flex item from being shrunk below its own content size — so on a long tree the browser was shrinking the frame down to exactly the scroll container's viewport height, and since the frame itself is `overflow: visible`, the rows kept rendering past the now-too-short border instead of being clipped or pushing the border down. Fix: added `shrink-0` next to the existing `min-h-full` — the frame can no longer be shrunk below its real content height, while `min-h-full` still keeps it filling the shell on short content.

**Files changed:** `packages/dashboard/app/(dashboard)/dashboard/folders/page.tsx` (one class added, one explanatory comment)

**Tested:** Diagnosed AND fix-verified live via `getBoundingClientRect()`/`getComputedStyle()` DOM measurement against the real long tree (`leads/all items`, 72 rows) in the running local Docker dashboard, before touching source (confirmed the exact shrink behavior, then confirmed `flexShrink: 0` fixes it). After the source edit + Docker rebuild: re-measured — frame height grew from 836px (cut short) to 2993px (matches content, `scrollHeight` 2991px), fully containing the last row; single existing scrollbar unchanged (`DashboardPageShell`'s own `overflow-y-auto`, no new scrollbar introduced); row positions/order unchanged (confirmed same 72 rows in the same order, only the container's own box height changed).

**Status: DONE**

# Task 3 — Shared Preview CP-link

**Requested:** `[VALID_UUID]` immediately above a `- ` note line becomes, in Preview, a link to that CP Item by its stable id (never its address) — UUID itself invisible — implemented once in the shared Preview (not duplicated per screen), working in both Folders and Knowledge, for hdr1 and hdr2 only (not md).

**Done:**
- New pure parser `packages/dashboard/lib/preview/cp-link.ts` (`annotateCpLinkTargets`) — walks the already-parsed headers-format node array; a `text`-type node whose trimmed content is exactly `[<uuid>]` and whose immediately-following node is a `note` gets dropped, and the note is cloned with a new `cpLinkTargetId` field (added to `ParsedNode` in `lib/headers/types.ts`). No fetches, no side effects — pure and independently unit-tested.
- Wired into **both** shared renderers at the one point they already call `parseHeadersFormat`+`groupNodes` (`hdr1-renderer.tsx`, `headers-renderer.tsx`'s hdr2 `HeadersRenderer`) — `md` (`MarkdownPreview`) and `no-format` (`RawTextPreview`) were never touched, so `[uuid]` stays inert there.
- New `components/shared/cp-link-text.tsx` renders the linked line as a button (styled underline, never the UUID) instead of plain text wherever `cpLinkTargetId` is set.
- New dba function `resolveCpItemByIdForUser` (`packages/dba/src/cp-link-resolver.ts`) resolves an id to its current `repoGuid`/`loca`, scoped to exactly the repos `shared-repo-access.ts` already allows a session to browse in Folders (own repo + `chad_shared`) — calls `PostgresCpProvider.getItem({id}, expectedRepoGuid)` directly (the shared router doesn't enforce repo isolation for id lookups, so it can't be used here). New thin route `GET /api/cp-items/[id]` exposes it. Never throws for a missing/foreign id — returns `null`, so a bad link degrades to a controlled "not found" state, never a crash or a leak.
- `CpLinkText` calls that route on click, then does a hard navigation (`window.location.href`, not `router.push`) to `/dashboard/folders?repoGuid=…&loca=…` — a client-side push was tried first and found broken when a CP-link is clicked *from inside Folders itself* (the already-mounted page's own read-once-on-mount effect never re-fires on a same-route query change), so a full navigation was used instead, which is correct from any origin page (Folders or Knowledge). `folders/page.tsx`'s existing mount effect gained a small addition to honor `?repoGuid=&loca=` when present and allowed.

**Files changed:** `packages/dashboard/lib/preview/cp-link.ts` (new), `packages/dashboard/lib/headers/types.ts`, `packages/dashboard/components/shared/hdr1-renderer.tsx`, `packages/dashboard/components/shared/headers-renderer.tsx`, `packages/dashboard/components/shared/cp-link-text.tsx` (new), `packages/dashboard/app/api/cp-items/[id]/route.ts` (new), `packages/dba/src/cp-link-resolver.ts` (new), `packages/dba/src/index.ts`, `packages/dashboard/app/(dashboard)/dashboard/folders/page.tsx`

**Tested:** Unit (`packages/dashboard/lib/preview/cp-link.test.ts`, 7/7 passing — valid pair, tab-indented pair, invalid UUID, no following dash, two consecutive pairs, ordinary content untouched). End-to-end live: created a scratch Text item under `temp` in Folders, saved `//pamiętać\n[21d11bdc-f1f4-44d1-b61a-3fa6b039c641]\n- Wyluzować co najmniej 2h`, confirmed in both hdr1 and hdr2 that the rendered DOM contains **no UUID anywhere**, "Wyluzować co najmniej 2h" renders as a link, and clicking it navigates to and correctly loads the real target item (the repo root, verified by its `item-id`/`Address`/`Name` all matching). Opened an existing real Knowledge document (`rady/kamil-s/26-08-11-na-saunie`) to confirm the shared hdr1 renderer still renders normally (headers, sections, list items, no crash) — no regression for content with no CP-link marker. Scratch item deleted afterward, no trace left in real data.

**Status: DONE**

# Task 4 — No regression to md / existing headers-format semantics

**Requested:** `md` stays a plain Markdown renderer with no CP-link extension; `//` headers, `t;`/`d;`/`-` markers, tabs, hdr1/hdr2 keep their existing behavior for content with no `[uuid]` marker.

**Done:** `annotateCpLinkTargets` only ever transforms a `text` node that is *exactly* `[<valid uuid>]` immediately followed by a `note` node — every other node passes through completely unchanged (verified by a dedicated "leaves ordinary headers-format content untouched" unit test, `toEqual` against the un-annotated array). `MarkdownPreview`/`RawTextPreview` never call the parser at all.

**Files changed:** none beyond Task 3's files.

**Tested:** Unit tests (see Task 3) plus live confirmation that a real, pre-existing Knowledge document (headers, todo/done markers, notes, no `[uuid]`) renders identically to before.

**Status: DONE**
