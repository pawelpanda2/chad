# Story 88 — Others from report

## Architectural decisions

- **`publishedSnapshot` instead of a full version-history array.** The input's
  own §12 explicitly allows a simplified `publishedVersion`/`draftVersion`
  v1 when full history "nadmiernie rozszerza Story." Implemented as: the
  live `AiPromptDefinition` record holds the current draft fields plus one
  frozen `publishedSnapshot` (the fields as they were at the moment of the
  last publish, tagged with its `version`). `updateAiPrompt` only ever
  writes draft fields; only `publishAiPrompt` writes `publishedSnapshot`.
  This satisfies "don't let a draft edit silently overwrite what's
  published" without a per-version array. **Not implemented:** browsing
  *older* published versions (v1, v2, ... history) — only the single most
  recent one is kept. A real version-history feature would need
  `publishedSnapshot` to become an array, plus a UI to browse it.
- **Message Creator's operation coverage stayed at `full-analysis`.** The
  registry/dba layer (`findPublishedAiPrompt`, `executeAiPrompt`,
  `OPERATION_TO_AI_PROMPT_ACTION_TYPE`) supports all five action types,
  including `next-message` (the input's explicit minimum requirement) —
  but the Creator UI's own "Send new" button still only ever sends
  `operation: "full-analysis"`, unchanged from Story 84/85. Building a
  per-operation trigger into the Creator UI (e.g. separate "Next Message" /
  "Improve" buttons) was judged out of scope for this Story: it would mean
  non-trivial changes to a UI that just shipped and works, for a UI
  affordance the input didn't literally require beyond "the data layer
  must support it." See `02_plan.md`'s "Scope decision" section for the
  full reasoning, and Task 8 in `05_tasks_and_checklist.md`.
- **Message Creator's pre-existing "prompt version" selector left
  untouched.** `MESSAGE_CREATOR_PROMPT_VERSIONS` (`SD-PL_v2`, etc.) is a
  different, older concept — a label bucketing/versioning *saved analysis
  runs* per message, with no executable content of its own. It is not the
  same thing as this Story's `AiPromptDefinition` and rewiring it to the
  new registry would have touched bootstrap/run-naming/every dropdown in a
  working UI for no real benefit. The actual integration point
  (`runMessageCreatorAiAction`'s `PROMPT_NOT_CONFIGURED` boundary) was
  always the intended extension seam (`school.promptRef.preparedPromptId`
  was already there, just never wired).
- **Editor's right pane is a static request preview, not a live test
  chat.** The input explicitly allows "a reasonable v1 placeholder" for
  the Code/request preview, "not at the expense of basic CRUD." A live
  chat-style tester would need a new test-execution API route and would
  risk implying real AI calls happen more casually than they should (input
  §11: never send an AI request automatically on render or save). The
  implemented preview is 100% static/local (client-side JSON.stringify of
  the current form state) — genuinely zero network calls.

## Known limitations

- Variables passed into `executeAiPrompt` from Message Creator today are
  limited to `lead_name`, `school_name`, `conversation`, `user_input` — not
  `reports`/`approach_context`/`my_proposals` (all present in the mockup's
  example variable list). Wiring those in would mean threading the already-
  loaded bootstrap data into `runMessageCreatorAiAction`, which currently
  fetches its own narrower slice of lead data independently. Left as a
  follow-up rather than expanding this Story's already-large surface.
- `ai-prompts.ts`'s tests are pure/fake-`ops`-based (mirrors `folders.ts`'s
  existing pattern) — no test in this Story exercises the real Content
  Provider path end-to-end (create → real CP write → real CP read) or two
  real logged-in users' isolation live. The underlying `runWithRepoContext`
  mechanism itself was already verified live (two real users, cross-user
  leak test) when it was introduced; this Story reuses it rather than
  re-proving it.
- No manual browser click-through was performed against a local dev server
  in this session. `./status.sh` showed a dashboard already listening on
  port 12020 with the Content Provider API unreachable — the same
  local-Docker stack Story 87 (a separate, parallel session running at the
  same time in this working directory) was actively debugging for a broken
  login flow. Restarting/rebuilding that stack risked colliding with that
  session's in-progress work and testing against a container that doesn't
  even have this Story's code deployed to it yet. Verification instead
  relied on: a clean `pnpm --filter dashboard build` (full type-check +
  static generation of every new route), 19 passing `ai-prompts.test.ts`
  unit tests, and the TEST deployment + smoke test described in this
  Story's closing summary.

## Follow-up proposals

- Wire a per-operation trigger into Message Creator (at minimum a "Next
  Message" action alongside "Send new") now that the registry fully
  supports it.
- Thread `reports`/`approach_context`/`my_proposals` into the variables
  passed to `executeAiPrompt`.
- A real multi-version history view (list of past `publishedSnapshot`s, not
  just the latest) if the product actually needs to compare/roll back
  between published versions.
- Anthropic/Gemini/OpenAI-compatible adapters, once one of those providers
  is actually needed — the boundary (`executeAiPrompt`'s `provider`
  switch) is already there, honestly reporting `provider-not-configured`
  until then.
