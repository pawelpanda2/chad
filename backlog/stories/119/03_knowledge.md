# Story 119 — Knowledge

- `packages/content-provider/postgre/src/provider/storage.ts:12-31` (`toCpItem`) and
  `packages/dba/src/data-providers/postgres-cp-provider.ts:78-80` (`rowToItem`) —
  confirmed `CpItem.config.id` (== `cp_items.id`) already flows unchanged through
  `dba` → `toApiItem` (`packages/dashboard/lib/folders-api.ts`) → the Folders GUI's
  own `CpConfig` type. No backend change was needed for item-id — only a JSX line.
- `packages/dba/src/data-providers/types.ts:28` — `GetItemInput = { id } | { address }`;
  `packages/dba/src/data-router.ts`'s `DbaDataRouter.getItem` does **not** thread an
  `expectedRepoGuid` through to the provider, so an `{ id }` lookup via the router is
  unsafe for cross-user isolation. `PostgresCpProvider.getItem(input, expectedRepoGuid?)`
  (`data-providers/postgres-cp-provider.ts:95`) does accept it directly — this is why
  `cp-link-resolver.ts` bypasses the router, same convention already used by
  `moveItemByAddress`/`readdressItemByAddress`/`deleteItemByAddress` in `item-ops.ts`.
- `packages/dba/src/shared-repo-access.ts` — `listSelectableFoldersRepos`/
  `resolveFoldersRepoAccess` already define the exact allowlist (own repo + `chad_shared`)
  Folders itself uses; reused as-is for the CP-link resolver's repo isolation instead of
  inventing a new permission model.
- `packages/dashboard/lib/headers/parse-headers-format.ts` + `types.ts` + `group-nodes.ts` —
  the shared headers-format parser/grouper both `hdr1-renderer.tsx` and the legacy
  `HeadersRenderer` (hdr2) already call. `groupNodes` silently drops any node that
  appears before the first level-0 `//` header (pre-existing behavior, unrelated to this
  Story) — a `[uuid]`/`-` pair with no `//` header above it renders "Empty content" in
  hdr1/hdr2, same as any other headerless content. Confirmed live.
- `packages/dashboard/lib/preview/preview-format.ts` / `components/shared/headers-renderer.tsx`'s
  `PreviewContent` — the one shared dispatch point (`no-format`/`hdr1`/`hdr2`/`md`) both
  Folders and Knowledge's document editor go through via `TextEditorWithToolbar` →
  `BodyTextEditor`'s Preview tab. Confirmed by reading `packages/dashboard/app/(dashboard)/
  dashboard/knowledge/[category]/[[...path]]/page.tsx` (uses the same `TextEditorWithToolbar`).
- **Frame root cause** (`folders/page.tsx`'s own nested `rounded-lg border` div, not
  `DashboardPageShell`'s outer frame): `min-h-full` on a flex item whose default
  `flex-shrink: 1` is still active REPLACES the item's implicit `min-height: auto`
  content-protection — the browser was shrinking the box down to exactly the scroll
  container's viewport height, discarding real content height, even though `overflow:
  visible` kept rendering the rows past the now-too-short border. Diagnosed and the fix
  verified via direct `getBoundingClientRect()`/`flexShrink` mutation in a live browser
  (Playwright against `localhost:12020`) BEFORE editing source. Root cause and fix are
  documented in the code comment at `folders/page.tsx`'s nested-frame div.
- `packages/dba/src/dev-db-override.ts` — this session's real-Postgres integration test
  (`cp-link-resolver.test.ts`, same convention as the pre-existing
  `postgres-cp-provider.test.ts`) requires real QNAP Tailscale credentials
  (`POSTGRES_QNAP_PASSWORD`/`POSTGRES_PASSWORD`) that this sandboxed session does not
  have — confirmed pre-existing/environment-only by running the identical, unmodified
  baseline test (and the official `pnpm test:integration:local-postgres` script) and
  getting the same failure. `getEffectivePostgresUri()` deliberately never redirects
  "server" source to an arbitrary local URI (`buildPostgresUriForSource`'s own comment:
  "Never silently redirect to a local mirror") — there is no supported local-only
  bypass for this class of test.
