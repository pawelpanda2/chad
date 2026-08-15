# Story 120 — Knowledge (pointers to docs/code needed for this Story)

- `ai-docs/begin_here/01_ai_start.md` / `02_what-and-where.md` — entry point;
  confirmed the repo's docs root is `human-docs/` (not `documentation/`,
  which the original input prompt assumed — checked before writing
  anything).
- `backlog/stories/119/` — the immediately-preceding Story (`[UUID]` → CP
  Item link parser + resolver). Read in full before starting; this Story's
  `01_input.md` explicitly says not to redo that work. The parser
  (`lib/preview/cp-link.ts`) and resolver (`dba`'s `resolveCpItemByIdForUser`,
  `/api/cp-items/[id]` — later deleted as dead code once its only caller
  was rewritten) were reused, not rebuilt.
- `packages/dashboard/components/shared/dashboard-history-provider.tsx` +
  `nav-group.tsx` (public main, pre-Story-120) — `nav-group.tsx` needed no
  changes; the provider's URL-equality heuristic was the actual bug
  (`A→B→A` misclassified as Back).
- `packages/dashboard/app/(dashboard)/dashboard/folders/page.tsx`
  (pre-Story-120, ~1570 lines) — local `nav.items`/`nav.index` stack,
  `pushItem`/`replaceCurrentItem` split (which mapped cleanly onto
  push-vs-replace semantics in the new design), read-only-folder banner's
  `currentNamePath` derivation (informed the new `ancestorNamePath`
  design).
- `packages/dashboard/app/(dashboard)/dashboard/knowledge/[category]/[[...path]]/page.tsx`
  and `app/api/knowledge/[category]/[[...path]]/route.ts` — read in full
  before the live-clarification-driven Knowledge migration; the address-mode
  branch was added alongside, not instead of, this existing name-slug logic.
- `packages/dba/src/knowledge.ts` (`listKnowledgeCategories`,
  `KnowledgeCategorySummary`) — Story 96's original "never send a CP
  address to the client" design decision, superseded in this Story once
  addresses were already pervasive in URLs elsewhere.
- `packages/dashboard/lib/folders-api.ts` (`toApiItem`) — the existing
  Folder body→index-map shape; `ChildrenDetailed` was added additively
  alongside it, not as a replacement.
- `ai-docs/tests/local-smoke-login.md` — credential-handling convention
  (env var names only in docs, values only in `.env.local`, never echoed)
  — followed when the user supplied a sudo password mid-Story for the
  `cp_1` mount blocker.
- `ai-docs/bash-scripts/local-mac-cp1.md` +
  `bash-scripts/dashboard/03_local_mac_docker/91_ensure-cp1-mounted.sh` —
  read when the deploy's `cp_1` preflight blocked the final Docker rebuild;
  confirmed the blocker (QNAP SMB auth) is unrelated to this Story's actual
  code (pure Postgres CP-item routing, no file storage).
