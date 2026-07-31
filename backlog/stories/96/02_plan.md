# Story 96 — Plan

## Audit findings (2026-07-31, before implementation)

- **`chad_shared` does NOT exist** in the real shared Server PostgreSQL
  (checked read-only over Tailscale): repo roots present are `chad_admin`
  (`0fc7da8d-…`), `chad_pawel_f` (`21d11bdc-…`), `test3` (`5a9c8b7d-…`),
  `chad_kamil_s` (`8b603669-…`). No item named `knowledge` exists anywhere.
- Repos are ordinary `cp_items` rows whose `address` is the bare repoGuid;
  the logical name lives in `config.name` (`chad_admin` precedent:
  `CHAD_ADMIN_REPO_GUID` hardcoded in `packages/dba/src/admin-users.ts`).
- Auth model: users-list (`chad_admin/users/users-list`) carries explicit
  `role: admin` (only `pawel_f`); sessions expose `user.isAdmin` — this is
  the existing minimal safe guard (already gates `allowSystemFolderWrite`
  in `/api/folders`).
- Folders today: repo select is hard-disabled; `/api/folders/repos` returns
  exactly one repo (session's own); all `/api/folders` verbs resolve
  addresses only inside `user.repoGuid`.
- Story 95 (Folders Body/Config) is uncommitted parallel work touching
  `folders/page.tsx`, `/api/folders/*`, `dba/folders.ts` — my changes are
  additive on top; do not revert or commit its files.
- Bulk tree fetch: `findRecursively(root, "")` returns ALL descendants (any
  depth, with bodies) in one query on both providers → no N+1.
- CP child order = numeric address order (`getChildren`/`findRecursively`
  already sort by address, numeric-aware) — that is the CP order to keep.

## Decisions

1. **New shared repo GUID** (generated once, hardcoded like chad_admin's):
   `CHAD_SHARED_REPO_GUID = "31275a71-3dd0-41a2-8874-2d12dac01590"`,
   root `config.name = "chad_shared"`. Created idempotently via dba
   (find-by-address → `putItem` root only when missing), never overwriting
   any existing children.
2. **Permissions:** read Knowledge = any authenticated user; select+write
   `chad_shared` in Folders = `user.isAdmin` only (smallest existing guard,
   no new role system). Client-supplied repoGuid is validated server-side
   against {own repo, shared repo if admin} — anything else 403.
3. **dba layer** — new `packages/dba/src/knowledge.ts`:
   - `ensureSharedKnowledgeRoot()` — idempotent chad_shared root +
     `knowledge` Folder (find-or-create via existing `createOrGetChild`).
   - `listKnowledgeCategories()` — Folder children of `knowledge`, CP order,
     with slugs derived from `config.name` (slugify; duplicates
     disambiguated with the CP index suffix, deterministic).
   - `getKnowledgeCategory(slug)` — one `findRecursively(categoryAddr, "")`
     call → sections (depth-1 Folders) + documents (depth-2 Texts), CP order.
   - `getKnowledgeDocument(categorySlug, documentSlug)` — name + body.
   - Slug validation `^[a-z0-9][a-z0-9-]{0,79}$` (blocks traversal/URL
     tricks); all addresses resolved server-side under
     `chad_shared/knowledge` only.
4. **API routes (thin adapters):**
   - `GET /api/knowledge` → `{ categories }` (200 + empty list when no root).
   - `GET /api/knowledge/[category]` → `{ category, sections }` (404 unknown).
   - `GET /api/knowledge/[category]/[document]` → `{ document }` (404).
   - All `dynamic = "force-dynamic"` (no static caching — fresh after
     Folders edits on refresh).
   - `/api/folders/repos` → own repo + (`isAdmin` ? chad_shared : nothing).
   - `/api/folders` GET/POST/PUT/DELETE + `/api/folders/config` PUT accept
     optional `repoGuid`; a shared pure helper `resolveFoldersRepoAccess`
     (unit-tested) grants: own repo always; shared repo admin-only (reads
     and writes — Folders is an editor); everything else 403.
5. **Frontend (design unchanged):**
   - `knowledge/page.tsx` — same tile grid, tiles from `/api/knowledge`,
     loading/empty/error states.
   - Delete static `knowledge/verbal-game/page.tsx`; add
     `knowledge/[category]/page.tsx` (same `LIST_ROW_WRAPPER_CLASS` /
     `LIST_ROW_CLASS` / `FRAME_SECTION_GAP_CLASS` frames; rows link to the
     document route) and `knowledge/[category]/[document]/page.tsx`
     (read-only body, DashboardPageShell + upLevel).
6. **Seeding (idempotent, one script run once):**
   `packages/dba/scripts/ensure-shared-knowledge.mjs` — creates chad_shared
   root, `knowledge`, category `verbal-game`, and the 6 current mockup
   section Folders with their Text document items (bodies EMPTY — the
   static page never had real document content; no content fabrication).
   Re-run = no-ops (find-or-create).
7. **Tests:** `knowledge.test.ts` (fake-ops: empty root, 2 categories → 2
   tiles, section mapping, document under right section, CP order, body,
   slug validation incl. traversal, duplicate slugs, idempotent ensure);
   `folders-repo-access.test.ts` (admin/non-admin/arbitrary GUID/other
   user's repo); wire into root vitest config. Existing `folders.test.ts`,
   dashboard+dba build/lint must stay green. `test:tables-sync` not run —
   scope does not touch tables/outbox/system-folders logic.
8. **Docker:** official `bash-scripts/dashboard/03_local_mac_docker/`
   build + re-start + status; real smoke: login, Knowledge → verbal-game →
   section → document; Folders as admin → chad_shared → knowledge → add
   item → visible in Knowledge after refresh.
9. Story docs + `human-docs/dashboard/knowledge/features/knowledge-cp-items.md`;
   commit only this Story's scope (Story 95 / audio-recording files stay
   uncommitted).
