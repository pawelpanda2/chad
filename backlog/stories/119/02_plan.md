# Story 119 — Plan

Starting commit: `1e4a0f4` (`feat(local-mac): Bash cp_1 mount, watchdog recovery, dashboard signal`), working tree clean, branch `main` 2 commits ahead of `origin/main` (no push planned).

## 1.1 — Folders item-id

`Config.id` (the real `cp_items.id` UUID, see `packages/content-provider/postgre/src/provider/storage.ts:20` / `packages/dba/src/data-providers/postgres-cp-provider.ts:79` `rowToItem`) already flows end-to-end to the Folders GUI unchanged (`toApiItem` in `packages/dashboard/lib/folders-api.ts` returns `Config: found.config` verbatim, and the frontend's local `CpConfig` type already declares `id: string`). No backend change needed — add one line to `packages/dashboard/app/(dashboard)/dashboard/folders/page.tsx` right after the existing `Address:` row (~line 1032): `item-id: <span className="font-mono">{currentItem.Config.id}</span>`, same style/copyability as Address.

## 1.2 — Folders outer frame

Reproduced live (localhost:12020, long `leads/all items` tree, 72 rows) and measured via DOM `getBoundingClientRect`/`getComputedStyle`. Root cause confirmed empirically:

`packages/dashboard/app/(dashboard)/dashboard/folders/page.tsx:963` — the page's own nested frame `<div className="flex min-h-full flex-col ...">` is a flex item inside `DashboardPageShell`'s `overflow-y-auto` scroll container. `min-h-full` (`min-height: 100%`) **overrides** the flex item's default `min-height: auto` (which normally protects a flex item from shrinking below its own content size). With the default `flex-shrink: 1` still in effect, the browser shrinks the frame down to exactly the scroll container's height (836px in the repro) even though its actual content is 2959px tall. Since the frame itself has `overflow: visible`, the tree rows still render (in normal flow, uncontained) past the now-too-short border — exactly the screenshot's symptom: items reach the bottom correctly, the border doesn't.

Verified fix in-browser (`element.style.flexShrink = '0'`): frame height jumped to 2973px (matches content), border now wraps everything, item positions unchanged (only the frame's own box size changed, not any child's layout). Fix: add `shrink-0` (Tailwind `flex-shrink: 0`) to that one div's className, next to the existing `min-h-full`. No `min-height` value changes, no item markup changes.

## 1.3–1.7, 3–4 — Shared Preview CP-link

**Parser (pure, no fetches)** — `packages/dashboard/lib/preview/cp-link.ts` (new): `annotateCpLinkTargets(nodes: ParsedNode[]): ParsedNode[]`. Walks the already-parsed node array (`parseHeadersFormat` output, `packages/dashboard/lib/headers/parse-headers-format.ts`) and, for every `type: "text"` node whose trimmed content is *exactly* `[<uuid>]` (strict UUID regex) **and** whose immediately-following node is `type: "note"`, drops the marker node from the output and clones the note node with a new `cpLinkTargetId` field. Every other case (invalid UUID, no following note, marker not immediately before a note) passes through completely unchanged — existing rendering is untouched, satisfying the fail-safe requirement. `ParsedNode` (`lib/headers/types.ts`) gets one new optional field: `cpLinkTargetId?: string`.

**Wiring — hdr1 and hdr2 only, not md**: `hdr1-renderer.tsx` and `headers-renderer.tsx`'s `HeadersRenderer` both currently do `groupNodes(parseHeadersFormat(content).nodes)`; both change to `groupNodes(annotateCpLinkTargets(parseHeadersFormat(content).nodes))`. `MarkdownPreview` (md) and `RawTextPreview` (no-format) are untouched — they never call this path, so `[uuid]` stays inert plain text/Markdown there, matching 1.4/1.7.

**Rendering**: new `components/shared/cp-link-text.tsx` — a small client component rendered in place of plain text wherever `node.cpLinkTargetId` is set (`ContentLine` in `headers-renderer.tsx`, `ChildLines`/`lineLabel` in `hdr1-renderer.tsx`). Renders the note's own text as a styled inline button (never a literal UUID) that, on click, resolves and navigates — no fetch happens during parsing/rendering, only on click, per 3's "parser nie powinien wykonywać fetchy."

**Resolver (dba → content-provider → provider, no DB from React)**: new `packages/dba/src/cp-link-resolver.ts`, exported via `packages/dba/src/index.ts`: `resolveCpItemByIdForUser(user: FoldersSessionLike, itemId: string): Promise<{ repoGuid, loca, name, type } | null>`. Tries the id against exactly the repos `listSelectableFoldersRepos` already grants a session (`shared-repo-access.ts` — own repo + `chad_shared`, the same allowlist `resolveFoldersRepoAccess`/Folders itself enforces), calling `PostgresCpProvider.getItem({id}, expectedRepoGuid)` directly (same "bypass the router for a Postgres-only capability" convention already used by `moveItemByAddress`/`readdressItemByAddress`/`deleteItemByAddress` in `item-ops.ts` — the shared `DbaDataRouter.getItem` does **not** thread `expectedRepoGuid` through, so it must not be used here for an id lookup). Returns `null` — never throws, never distinguishes "doesn't exist" from "not yours" — for anything outside that allowlist or any non-Postgres backend, satisfying "brak dostępu"/"brak crasha" for a foreign or missing id.

New thin API route `packages/dashboard/app/api/cp-items/[id]/route.ts`: `GET`, session-gated (`getCurrentUserFromCookies`), validates `id` is a UUID before calling `dba`, calls `resolveCpItemByIdForUser`, 404 on `null`, else `{ repoGuid, loca, name, type }`. No business logic beyond that — same "thin adapter" convention as every other route.

**Navigation**: click handler in `cp-link-text.tsx` calls that route, then `router.push('/dashboard/folders?repoGuid=…&loca=…')`. `folders/page.tsx`'s mount effect gets a minimal addition: read `repoGuid`/`loca` from `useSearchParams()` once and, if `repoGuid` is in the session's own repo list, load that item instead of the default repo root (existing `locaInput`/address sync effects already pick up the loaded item — no further change needed). This satisfies 1.6 ("smallest correct mechanism" through Dashboard → dba → Content Provider → provider) without inventing Knowledge-specific slug resolution — Folders is already the general "view any CpItem by address" screen and can reach anything in the same allowed repos (including Knowledge's own tree), so a link opened from Knowledge's Preview also resolves correctly.

## Tests

- `packages/dashboard/lib/preview/cp-link.test.ts` (new, pure unit tests mirroring `preview-format.test.ts`'s style): all cases from the task's §4 minimum list (valid UUID+dash, tab-indented, invalid UUID, UUID with no following dash, two consecutive links, hdr1/hdr2 with no UUID unaffected).
- `packages/dba/src/cp-link-resolver.test.ts` (new): own repo hit, `chad_shared` hit, foreign repo → null, nonexistent id → null, non-Postgres backend → null.
- Existing `hdr1-renderer.test.tsx`/`headers-renderer` tests re-run to confirm no regression; add one case per renderer showing a `[uuid]`+note pair renders the note as a link with the UUID never appearing in the DOM.
- `text-editor-with-toolbar-preview-format.test.tsx` re-run untouched (md path unaffected).

## Verification

- `pnpm typecheck` / build for `dba` and `dashboard`.
- `pnpm vitest run` for the touched packages.
- Manual smoke already partially done live against `localhost:12020` (Playwright): reproduced the frame bug, confirmed the fix in-browser via DOM mutation before touching source. After the real edits: re-check Folders (address+item-id row, long tree frame, no item movement, no new scrollbar) and open a Knowledge document containing a `[uuid]`/`-` pair to confirm the link renders and navigates.
- No PROD/deploy action; no push.
