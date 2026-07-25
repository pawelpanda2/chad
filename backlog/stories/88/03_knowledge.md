# Story 88 — Knowledge

- `packages/dba/src/item-ops.ts` — generic, backend-agnostic Item ops
  (`findOrCreateFolderChain`, `createOrGetChild`, `putItemBody`,
  `getItemByAddress`, `getChildrenOf`). `ai-prompts.ts` uses
  `findOrCreateFolderChain(["msg-auto"])` then `createOrGetChild(folder,
  "ai prompts", "Text", initialBody)` — same lazy find-or-create pattern
  `message-creator.ts`'s `ensureMsgWorkoutFolder`/`getOrCreateApproachContext`
  already use for `approach context`/`my proposals`.
- `packages/dba/src/folders.ts` + `folders.test.ts` — the injectable-`ops`
  unit-test pattern (`FolderChildOps`) to mirror for `ai-prompts.ts`'s own
  `AiPromptsOps`, so CRUD/validation is testable without a real Content
  Provider.
- `packages/dba/src/message-creator.ts` — `runMessageCreatorAiAction`'s
  `PROMPT_NOT_CONFIGURED` boundary is the real integration point (see
  `02_plan.md`'s scope decision). `MESSAGE_CREATOR_PROMPT_VERSIONS` is an
  unrelated, pre-existing "run label" concept — left untouched.
- `packages/console/src/openai/askOpenAiAboutGirl.ts` (`callOpenAiPreparedPrompt`)
  — the only existing OpenAI integration in the repo (console only, not
  dba/dashboard). Reference pattern for `ai-prompts-openai.ts`: `new
  OpenAI({ apiKey: process.env.OPENAI_API_KEY })`, `openai.responses.create({
  prompt: { id, version }, input: [...] })`, `response.output_text`.
  `openai` (`^6.43.0`) is already a dependency of `packages/console` —
  added to `packages/dba/package.json` at the same version, not invented.
- `packages/dashboard/app/api/leads/message-creator/route.ts` — thin
  route pattern (`getCurrentUserFromCookies` → 401 → `runWithRepoContext` →
  one `dba` call → `NextResponse.json`) mirrored for the new
  `/api/msg-automation/ai-prompts*` routes.
- `human-docs/dashboard/common/features/chad-user-data-isolation.md` —
  `runWithRepoContext`/`getCurrentRepoGuid()` is the only source of
  per-user isolation; `ai-prompts.ts` never accepts a `repoGuid` parameter.
- `human-docs/dashboard/common/features/responsive-layout-standard.md` —
  `DashboardPageShell` (list) / `EditorPageShell` (editor, two-pane like
  `message-creator/page.tsx`'s own `md:[grid-template-columns:...]`
  pattern) + `NavGroup upLevel` for Back.
- `examples/CHAD_AI_Prompts_mockup_v2.html` — visual reference only (own
  CSS, not CHAD components) for the two-pane editor layout and list
  columns; re-implemented with real CHAD components
  (`DashboardPageShell`/`EditorPageShell`/shadcn `Select`/`Badge`/`Button`),
  not copied as markup/CSS.
