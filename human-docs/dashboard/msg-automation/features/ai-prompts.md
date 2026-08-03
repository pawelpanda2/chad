# Feature: AI Prompts (Story 88)

## Purpose

A provider-neutral prompt registry for Msg Auto: create/edit/publish AI
prompts (developer/system/user instructions, variables, provider + model
settings) and use them as the single source of prompt definitions for
Message Creator's AI execution.

## Routes

**UI:**
```
/dashboard/msg-automation/ai-prompts            Prompt List
/dashboard/msg-automation/ai-prompts/new         Prompt Editor (new)
/dashboard/msg-automation/ai-prompts/[promptId]  Prompt Editor (existing)
```
Entry: Msg Auto → **AI PROMPTS** (directly after **CREATOR**).

**API** (`packages/dashboard/app/api/msg-automation/ai-prompts/`):
```
GET   /api/msg-automation/ai-prompts        list (AiPromptSummary[])
POST  /api/msg-automation/ai-prompts        create
GET   /api/msg-automation/ai-prompts/[id]   one full AiPromptDefinition
PATCH /api/msg-automation/ai-prompts/[id]   update draft fields, or
                                             { "action": "publish" | "archive" }
```
Every route: `getCurrentUserFromCookies()` → 401 `NOT_AUTHENTICATED` without
a session → `runWithRepoContext(user, ...)` → one `dba` call. No raw
`invokeContentProvider()` in any route, no provider API keys ever appear in
a response.

## Content Provider structure — shared, not per-user (amended)

```
chad_shared          (fixed repo, CHAD_SHARED_REPO_GUID — see knowledge.ts)
└── msg-auto         (Folder, lazily created)
    └── ai prompts   (Text item, lazily created)
```

**Deliberate exception to this repo's usual per-user isolation.** AI Prompts
is a single global, shared resource: the registry always lives under
`chad_shared` (the same repo Knowledge already reads), never under the
calling user's own repo. Every logged-in user reads, edits, publishes, and
executes the exact same list — there is currently no owner/permission model
(no read-only users, no per-prompt owner); that's a planned future layer,
not an oversight (see this Story's follow-up notes). `ai-prompts.ts` never
calls `getCurrentRepoGuid()` — storage is rooted via `item-ops.ts`'s
`findOrCreateFolderChainFrom(CHAD_SHARED_REPO_GUID, ["msg-auto"])` →
`createOrGetChild(folder, "ai prompts", "Text", ...)`, a generalized form of
the `findOrCreateFolderChain` pattern `message-creator.ts` uses for
`approach context`/`my proposals` (which stays per-user, unaffected).

API routes still call `getCurrentUserFromCookies()` (401 without a session)
and still wrap calls in `runWithRepoContext(user, ...)` — but only so the
caller's own identity is best-effort stamped as the *actor* on the Postgres
history trigger; it has no bearing on where this feature's data lives. No
`repoGuid` is ever accepted from a query/body param.

Body — a single JSON document, `schemaVersion: 1`:
```json
{ "schemaVersion": 1, "prompts": [ /* AiPromptDefinition[] */ ] }
```
Reading a missing/empty item returns `{ schemaVersion: 1, prompts: [] }` —
never a crash. **Corrupt JSON is never auto-repaired**: if the body exists
but fails `JSON.parse` (or isn't a recognizable registry document), every
read/write throws `AiPromptsOperationError` with `code: "CORRUPT_REGISTRY"`
(surfaced as HTTP 422) and the existing body is left untouched for manual
recovery — no silent overwrite with an empty list.

## Provider-neutral model

`packages/dba/src/ai-prompts.ts` defines `AiPromptDefinition` (id, slug,
name, schoolId, actionType, status, version, messages, variables, provider,
model, settings, providerBindings, timestamps) — independent of any single
provider's SDK types. `AiProvider = "openai" | "anthropic" | "gemini" |
"openai-compatible"`. The domain module never imports the `openai` package;
translation to a concrete provider request lives entirely in
`ai-prompts-openai.ts`.

## Versioning

Simplified v1 (full multi-version history intentionally deferred — see
Story 88's `06_others_from_report.md`):

- A new prompt starts `status: "draft"`, `version: 1`.
- `updateAiPrompt` edits only the draft's live fields (name, messages,
  variables, provider, model, settings, ...) — it **never** touches
  `status`, `version`, `publishedVersion`, or `publishedSnapshot`.
- `publishAiPrompt` bumps `version` by 1, freezes the current draft fields
  into `publishedSnapshot` (tagged with that version number), and sets
  `status: "published"`. Because `publishedSnapshot` is only ever written
  here, further draft edits can never implicitly change what's live.
- `archiveAiPrompt` sets `status: "archived"` — it stops being resolvable
  by `findPublishedAiPrompt` (Content Provider has no working Delete, so
  history isn't erased, just excluded from resolution).

## Conversation tab — lead analysis flow (Story 102)

GUI equivalent of `packages/console/src/openai/askOpenAiAboutGirl.ts`'s
`askOpenAiAboutGirlFlow` — not a context-free chat. The editor's
**conversation** tab (`ai-prompt-conversation-panel.tsx`) is a two-panel
layout:

- **Left — context** (`ai-lead-context-panel.tsx`): pick a lead from the
  caller's own repo (`GET /api/leads-dashboard`, search + newest-first, no
  auto-request until a lead is picked), which automatically fetches report
  and source-conversation candidates
  (`GET /api/msg-automation/ai-prompts/lead-context`, backed by
  `dba`'s `getLeadAnalysisContext` → the *same*
  `listLeadReportsForCreator` / `getLeadConversationForCreator` Message
  Creator uses — saved-link → live phone/name match → legacy fallback, never
  a separate/weaker algorithm). Both selections default to console's own
  behavior (first found report; the resolved conversation if any) and can be
  changed to any other report or to "none". The base `<current_case>` prompt
  and the final prompt (base + optional additional input) are always shown
  in full, built exclusively by `dba`'s `buildLeadAnalysisCurrentCase` /
  `appendAdditionalUserInput` (`lead-analysis-prompt.ts`) via
  `POST .../lead-context/preview` — never assembled in React.
- **Right — chat**: conversation history, an "additional input" textarea
  (appended to, never replacing, the base prompt), and Send. Send is
  disabled until the prompt is saved *and* a lead is selected; an empty
  additional-input textarea still sends (the base prompt alone).

`POST .../[id]/run` requires `leadName` (never a bare `message`) and rebuilds
the exact same `<current_case>` + additional-input text server-side before
calling `executeAiPrompt` — the preview endpoint and the real request can
never drift apart because both call the same two `dba` functions.

## Message Creator integration

`findPublishedAiPrompt({ actionType, schoolId })` (`ai-prompts.ts`) resolves
a **published-only** prompt — an exact `schoolId` match first, falling back
to a school-agnostic published prompt, `null` if nothing matches (never a
draft, never invented).

`message-creator.ts`'s `runMessageCreatorAiAction` calls this before its
legacy `school.promptRef.preparedPromptId` boundary, mapping Message
Creator's own operation names to the registry's `actionType`
(`OPERATION_TO_AI_PROMPT_ACTION_TYPE`: `health`→`conversation-health`,
`capital`→`capital`, `next-message`→`next-message`, `improve`→`improve`,
`full-analysis`→`full-analysis`). If a published prompt resolves, it's
executed via `ai-prompts-openai.ts`'s `executeAiPrompt` and the result is
saved through the existing `saveAnalysisRun` path (`status: "complete"`,
`payload.rawOutput`, `proposalText`). If nothing resolves, behavior is
byte-for-byte the same `PROMPT_NOT_CONFIGURED` result Story 84/85 always
returned — no regression.

`getMessageCreatorBootstrap` additionally resolves a prompt for
`full-analysis` + the lead's default school and returns it as
`resolvedPrompt: { id, slug, name, publishedVersion } | null`. The Creator
UI (`leads/message-creator/page.tsx`) shows this next to **Send new** —
the resolved prompt's name/version, or **"Prompt not configured"** with a
link to create one. The Creator never stores a prompt id itself; it's
resolved fresh on every bootstrap load, so publishing a new version in the
AI Prompts editor is picked up on the Creator's next refresh with no other
change needed.

**Scope note:** Message Creator's pre-existing "prompt version" selector
(`MESSAGE_CREATOR_PROMPT_VERSIONS`, e.g. `SD-PL_v2`) is a different,
unrelated concept — a label used to bucket/version saved analysis runs per
message, with no content of its own — and was intentionally left untouched.
See Story 88's `02_plan.md` for the full reasoning.

## OpenAI execution boundary

`packages/dba/src/ai-prompts-openai.ts`, server-side only:

- `OPENAI_API_KEY` read exclusively from `process.env` — never a parameter,
  never echoed back.
- **Locally stored prompt** (no `providerBindings.openaiPromptId`): builds
  `role`/`content` messages from `AiPromptDefinition.messages` (with
  `{{variable}}` substitution) and calls `openai.responses.create({ model,
  input, text?, reasoning? })`.
- **OpenAI stored prompt** (`providerBindings.openaiPromptId` set): calls
  `openai.responses.create` with `prompt: { id, version }`,
  `input: [{ role: "user", content }]`, plus `reasoning.summary` / `store` /
  web_search `include` from definition settings — same shape as console
  `callOpenAiPreparedPrompt`.
- Optional idempotent draft import of the console girl stored prompt
  (same fields as GUI managed create):  
  `pnpm --filter dba exec node scripts/import-console-openai-girl-prompt.mjs`
- Any other `provider` value returns `{ status: "provider-not-configured"
  }` — an honest boundary, never a faked response.
- No request is ever sent automatically on render or on save — only when
  Message Creator's "Send new" actually resolves a published prompt.

## Errors and recovery

| Situation | Behavior |
|---|---|
| `msg-auto`/`ai prompts` doesn't exist yet | Lazily created on first write; reads return `[]` until then |
| Duplicate `slug` on create/rename | `AiPromptsOperationError(DUPLICATE_SLUG)` → HTTP 400 |
| Empty name/slug/content | `AiPromptsOperationError(VALIDATION)` → HTTP 400 |
| Corrupt JSON body | `AiPromptsOperationError(CORRUPT_REGISTRY)` → HTTP 422, body untouched |
| Prompt not found | `AiPromptsOperationError(NOT_FOUND)` → HTTP 404 |
| No session | HTTP 401 `NOT_AUTHENTICATED` |

## Tests

- `packages/dba/src/ai-prompts.test.ts` — registry CRUD / publish / corrupt
  guard / `findPublishedAiPrompt`.
- `packages/dba/src/ai-prompts-openai.test.ts` — stored-prompt Responses
  payload (id/version/message-array input/settings; no API key in result).
- `pnpm --filter dba build` / `pnpm --filter dashboard build`.
