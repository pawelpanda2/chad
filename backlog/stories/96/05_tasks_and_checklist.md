# Story 96 — Tasks Checklist

| #  | Ai Status | Real Status | Task |
|----|-----------|-------------|------|
| 1  | DONE      |             | Audit: confirmed `chad_shared` did NOT exist in `cp_items` (only `chad_admin` + per-user repos); confirmed CpItem contract (`config.name`, `type: "Text"/"Folder"`, numeric child addresses = insertion order) |
| 2  | DONE      |             | `packages/dba/src/knowledge.ts` — list categories, category tree (single `findRecursively` query, no N+1), document read, slugify + strict slug validation, idempotent `ensureSharedKnowledgeRoot` |
| 3  | DONE      |             | `packages/dba/src/shared-repo-access.ts` — session-derived selectable repos; per-request `repoGuid` resolution (own repo always, `chad_shared` admin-only, everything else 403) |
| 4  | DONE      |             | Thin guarded API routes: `GET /api/knowledge`, `/api/knowledge/[category]`, `/api/knowledge/[category]/[document]` (force-dynamic, 400/401/404 mapped) |
| 5  | DONE      |             | Knowledge UI on cp_items with dynamic routes `[category]` / `[category]/[document]`; same shell/grids/`LIST_ROW_*`/`FRAME_SECTION_GAP_CLASS`; static `verbal-game/page.tsx` and GROUPS removed; loading/empty/error/not-found states |
| 6  | DONE      |             | Folders: repos list from backend session (`/api/folders/repos`), `chad_shared` selectable by admin only; all verbs + config route validate `repoGuid` server-side; UI Select enabled when >1 repo |
| 7  | DONE      |             | Idempotent seed `packages/dba/scripts/ensure-shared-knowledge.mjs`: created `chad_shared` repo root + `knowledge` + Verbal Game structure (2 sections, 5 documents, EMPTY bodies — no fabricated content); re-run confirmed no duplicates |
| 8  | DONE      |             | Regression tests: `knowledge.test.ts` (28) + `shared-repo-access.test.ts` (12) added to vitest config; full `pnpm test` suite PASS locally; dashboard `pnpm build` + dba `tsc` PASS |
| 9  | DONE      |             | Official local Docker rebuild + restart (`bash-scripts/dashboard/03_local_mac_docker/`), healthcheck OK; real smoke in Docker (see below) |
| 10 | DONE      |             | Docs (`human-docs/dashboard/knowledge/features/knowledge-cp-items.md`) + Story files |
| 11 | PARTIAL   |             | Commit — own-scope files committed; the three Folders files shared with still-uncommitted Story 95 work left uncommitted (see `06_others_from_report.md`) |

## Smoke results (local Docker, 2026-07-31)

All via real HTTP against the rebuilt local stack (PASS w lokalnym Dockerze):

- `GET /api/knowledge` → `[{"slug":"verbal-game","name":"Verbal Game"}]`;
  category → 2 sections with 3+2 documents in CP order; document → name +
  body; bad slug → 400; unknown slug → 404; no session → 401.
- UI routes `/dashboard/knowledge`, `/dashboard/knowledge/verbal-game`,
  `/dashboard/knowledge/verbal-game/rozwijanie-tematu` → 200, dynamic data
  rendered.
- Admin (`pawel_f`): repos list contains `chad_shared`; created fixture
  folder+text under `knowledge` via Folders API → appeared in
  `/api/knowledge` → deleted fixture → gone (404). Own data untouched.
- Non-admin (`test3`): repos list = own repo only; POST/PUT/DELETE with
  `repoGuid=chad_shared` → 403; arbitrary/other-user repoGuid → 403; own
  Folders CRUD unchanged (regression PASS).
