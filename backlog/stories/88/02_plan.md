# Story 88 — Plan

`$repo_path` in the input resolves to
`/Users/pawelfluder/03_synch/01_files_programming/08_nodejs/chad` (the new
`chad` pnpm monorepo — confirmed via `git status`/repo layout, not the
sibling `chad-dba` checkout this session started in). Story 87 (unrelated,
a parallel session's local-Docker-login fix) already claimed the previous
number, so this is Story 88.

## Scope decision on Message Creator integration (read before implementing)

Story 84/85's `message-creator.ts` already has a concept called "prompt
version" (`MESSAGE_CREATOR_PROMPT_VERSIONS`, e.g. `SD-PL_v2`) — but that is
**not** the same concept as this Story's `AiPromptDefinition`. The existing
one is a *label* used to bucket/version saved analysis runs per message
(`promptVersionId` stored on each run, driving the "Open (N)" dropdown and
run history) — it has no content, no messages/variables, nothing
executable. Rewiring it to the new async CP-backed registry would touch the
bootstrap, run-naming, and every dropdown in a working, recently-shipped UI
— high risk, not what the task is actually asking for.

The actual integration point is `runMessageCreatorAiAction`'s `PROMPT_NOT_CONFIGURED`
boundary (`message-creator.ts`), which is where `school.promptRef.preparedPromptId`
was always meant to plug in. Plan:

- `dba/ai-prompts.ts` exposes `findPublishedAiPrompt({ actionType, schoolId })`.
- `runMessageCreatorAiAction` calls it (mapping `operation` → `actionType`:
  health→conversation-health, capital→capital, next-message→next-message,
  improve→improve, full-analysis→full-analysis) *before* falling into the
  legacy `promptRef` check. If found (published only) → execute via the
  OpenAI adapter → `saveAnalysisRun(status: "complete", ...)`. If not found
  → unchanged `PROMPT_NOT_CONFIGURED` behavior (identical to today).
- Creator UI gets one small additive element: a prompt-status indicator
  next to "Send new" showing the resolved published prompt's name or
  "Prompt not configured" — no new operation picker, no removal of any
  existing control. `sendNew()` already always sends `operation:
  "full-analysis"`; that's the one action-type this Story's UI can
  exercise live. The registry/dba layer supports all action types
  (including `next-message`) so a future Story adding per-operation
  triggers to Creator has nothing left to build on the data side — this is
  recorded as a conscious scope boundary in `06_others_from_report.md`, not
  silently implied as "done".

## Files

**dba (packages/dba/src/):**
- `ai-prompts.ts` (new) — types, CP storage (`msg-auto` Folder → `ai
  prompts` Text, schemaVersion 1 JSON), `listAiPrompts`, `getAiPrompt`,
  `createAiPrompt`, `updateAiPrompt`, `archiveAiPrompt`, `publishAiPrompt`,
  `findPublishedAiPrompt`. Injectable `ops` seam (mirrors `folders.ts`) for
  unit tests. Corrupt-JSON guard: never auto-overwrite, throw a typed error.
- `ai-prompts-openai.ts` (new) — OpenAI Responses API adapter
  (`executeAiPrompt`), local-messages and `providerBindings.openaiPromptId`
  variants; other providers → `provider-not-configured`.
- `ai-prompts.test.ts` (new) — unit tests per input §13.
- `message-creator.ts` — `runMessageCreatorAiAction` additive change (see
  above). No signature change.
- `index.ts` — add `export * from './ai-prompts.js'`.
- `package.json` — add `openai` dependency (already used by
  `packages/console`, same version).

**dashboard (packages/dashboard/):**
- `app/api/msg-automation/ai-prompts/route.ts` (new) — GET list, POST create.
- `app/api/msg-automation/ai-prompts/[id]/route.ts` (new) — GET one, PATCH
  update (also handles publish/archive via `action` field to avoid a 5th
  route).
- `app/(dashboard)/dashboard/msg-automation/ai-prompts/page.tsx` (new) —
  Prompt List.
- `app/(dashboard)/dashboard/msg-automation/ai-prompts/[promptId]/page.tsx`
  (new) — Prompt Editor (`promptId === "new"` → New prompt).
- `app/(dashboard)/dashboard/msg-automation/page.tsx` — add "AI PROMPTS"
  tile directly after "CREATOR".
- `components/shared/sidebar.tsx` — add the two new routes to Msg Auto's
  `activePrefixes`.
- `packages/dashboard/app/(dashboard)/dashboard/leads/message-creator/page.tsx`
  — small additive prompt-status readout (see integration section).

**Docs:** `human-docs/dashboard/msg-automation/features/ai-prompts.md` (new).

## Order of work

1. `ai-prompts.ts` (types, CP storage, CRUD, validation, versioning) + unit
   tests, run `pnpm --filter dba test`.
2. `ai-prompts-openai.ts` adapter.
3. Wire into `index.ts`, add `openai` dep, `pnpm install`, `pnpm --filter dba build`.
4. Next.js API routes.
5. Dashboard GUI (List, Editor), msg-automation tile, sidebar prefixes.
6. Message Creator integration (dba + thin UI readout).
7. `pnpm --filter dashboard build`.
8. Docs.
9. Story checklist, commit, push.
10. Deploy TEST (official script) + smoke test.
