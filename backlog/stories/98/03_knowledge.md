# Story 98 — Knowledge

- `packages/dashboard/components/shared/text-editor-with-toolbar.tsx` —
  shared editor; `isEditorMode` gates Save/WCH/Saved. Every caller
  (`msg-workout`, `forms`, `todo-msg/edit`, `msg-planner`, `views`,
  `folders`) confirmed via grep before the fix — only `folders/page.tsx`'s
  Config block passes `showPreview={false}`.
- `packages/dba/src/folders.ts` — all Folder business operations
  (`createFolderChildItem*`, `updateFolderTextBody*`,
  `updateFolderItemConfig*`, `deleteFolderItem*`, and now
  `buildFolderExport`/`exportFolderTree`/`countFolderExportItems`/
  `parseFolderExportMode`) live here, all sharing the `FolderChildOps`
  injectable-ops seam and `FoldersOperationError` for consistent
  route-level status mapping (`packages/dashboard/lib/folders-api.ts`'s
  `statusForFoldersError`).
- `packages/dba/src/cp-model.ts`'s `parseChildIndex`/`formatChildIndex` —
  the numeric CP-index convention (`01`..`999`, last address segment);
  reused directly for the export's sort order instead of re-deriving it.
- `packages/dashboard/app/api/folders/route.ts` /
  `.../folders/config/route.ts` / (new) `.../folders/export/route.ts` — all
  three share the same session → `resolveFoldersRepoAccess` →
  `runWithRepoContext` shape; `toApiItem`/`statusForFoldersError` had to be
  factored into `lib/folders-api.ts` (Story 95) because a Next.js App
  Router `route.ts` may only export HTTP-verb handlers.
- No prior precedent in this repo for unit-testing a `route.ts` handler in
  isolation, or for `@testing-library/react`/`jsdom` at all — both were
  confirmed absent before adding them (see `02_plan.md`). Route-level
  auth/limit checks for the new export endpoint were verified instead via
  real curl smoke tests against the running local Docker stack (same
  convention Story 95 used for its own new route).
- Local session cookies in this environment are unsigned
  (`SESSION_SIGNING_SECRET` not set in `.env.local`/`docker-compose.local.yml`)
  — `verifySessionToken` intentionally falls back to accepting
  `session=<repoGuid>` verbatim in that case (see
  `packages/dashboard/lib/session-token.ts`'s own doc comment). This is
  exactly what real logins in this environment already produce, so it was
  used to smoke-test as `test3` without needing test3's real bcrypt
  password (never available to this session, and never should be
  committed anywhere — see `.env.local.example`/`tests/README.md`).
- `bash-scripts/dashboard/03_local_mac_docker/06_deploy.sh`'s restart step
  bind-mounts `${CHAD_AUDIO_RECORDINGS_HOST_PATH:-/Volumes/cp_1/...}`
  (Story 93, audio recordings) — on this machine `/Volumes/cp_1` doesn't
  exist, which otherwise blocks the dashboard container from starting at
  all. Worked around locally via a `.env.local`-only override (never
  committed) — see `06_others_from_report.md`.
