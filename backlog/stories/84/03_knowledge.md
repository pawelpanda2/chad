# Story 84 — Knowledge pointers

Targeted references only — why each was needed for this planning Story.

## Global begin_here

- `ai-docs/begin_here/01_ai_start.md` — mandatory entry order; PLAN-only stop rule context.
- `ai-docs/begin_here/02_what-and-where.md` — index; confirmed human-docs paths under `human-docs/`.
- `ai-docs/begin_here/03_story-standard.md` — Story folder/files rules; checklist mandatory.
- `ai-docs/begin_here/05_endpoint-rules.md` — DBA boundary, thin routes, no fake Save.

## Feature docs (read)

- `human-docs/dashboard/common/features/responsive-layout-standard.md` — `EditorPageShell` / no page scroll / dual-pane scroll ownership.
- `human-docs/dashboard/common/features/shared-text-editor-toolbar.md` — reuse for My Proposals / Improve input.
- `human-docs/dashboard/common/features/chad-user-data-isolation.md` — session/`runWithRepoContext`; no client `repoGuid`.
- `human-docs/dashboard/leads/features/msg-workouts.md` — workout list on lead details; GetByNames2 pattern.
- `human-docs/dashboard/leads/features/msg-workout-details.md` — classic editor route/query contract to preserve.
- `human-docs/features/messages-cp-conversations.md` — conversation feature overview (**doc API shape partially stale** — see mismatches).
- `human-docs/console/features/openai-prepared-prompt.md` — Console current_case + prepared prompt flow (prompts out of scope here).
- `human-docs/dba/features/msg-workout-new.md` — create workout naming (`YY-MM-DD` / `b`/`c`).

## Code (read / grepped)

- `packages/console/src/openai/askOpenAiAboutGirl.ts` — Console save path via `SaveAiAnswerToMsgWorkout`.
- `packages/console/src/openai/dataProviders.ts` — already uses `chad_FindConversationByLeadName` + `chad_FindReportsByLeadName`.
- `packages/dba/src/ai-answer.ts` — `BuildNextAiBotName` / `SaveAiAnswerToMsgWorkout` (`YY-MM-DD; ai bot`); keep for Console; Creator needs a **separate** general saver.
- `packages/dba/src/beeper.ts` — `getBeeperWhatsappConversation`, `chad_FindReportsByLeadName`, `chad_FindConversationByLeadName`, `ReportResult`.
- `packages/dba/src/leads.ts` — msg workout list/create/edit APIs.
- `packages/dba/src/reports.ts` — `GetReports` / `GetReportByName` (category listing; lead search is in `beeper.ts`).
- `packages/dba/src/index.ts` — confirms `ai-answer` export surface.
- `packages/dashboard/app/(dashboard)/dashboard/leads/msg-workout/page.tsx` — classic editor; do not replace.
- `packages/dashboard/app/api/leads/msg-workout/route.ts` — thin GET/POST + session pattern.
- `packages/dashboard/app/(dashboard)/dashboard/leads/details/page.tsx` — workout links / create CTA entry for new Creator link.
- `packages/dashboard/app/(dashboard)/dashboard/messages/page.tsx` — **inline** `parseWhatsAppMessages` (extract candidate).
- `packages/dashboard/app/api/beeper/conversation/[leadName]/route.ts` — live conversation API (dynamic segment).
- `packages/dashboard/app/api/beeper/leads/route.ts` — all leads list for Messages.
- Shared shells: `editor-page-shell.tsx`, `dashboard-page-shell.tsx`, `text-editor-with-toolbar.tsx`, `nav-group.tsx`.

## Doc ↔ code mismatches (plan follows code)

1. `messages-cp-conversations.md` documents `GET /api/beeper/conversation?lead=` — **actual route** is `GET /api/beeper/conversation/[leadName]`.
2. Same doc still mentions a hard-coded shared repo GUID in places — isolation is now per-user via `runWithRepoContext` (see isolation feature doc).
3. Prompt’s `//you` convention is **not implemented** as a DBA/parser API; treated as optional soft-import heuristic only.
4. `SaveAiAnswerToMsgWorkout` uses `PostParentItem(..., "Text", "msg workout")` for the workout container — historical quirk; Creator should use existing Folder-oriented lead helpers (`createMsgWorkoutForLead` / find-or-create Folder) for new structure, without “fixing” old Console items.
