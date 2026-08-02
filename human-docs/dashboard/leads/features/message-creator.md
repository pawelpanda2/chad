# Feature: Message Creator (Story 84 + Story 85)

## Purpose

Lead-scoped GUI for Beeper conversation review and message-level analysis.
Does **not** replace the classic `/dashboard/leads/msg-workout` document editor.

## Route

```
/dashboard/leads/message-creator?leadName=…&leadLoca=…
```

Entry: Msg Auto → **CREATOR**, or Lead details → **Open Message Creator**.

## Modes (Story 85)

- **Beeper** — full-width conversation; per-message analysis combobox when
  saved run count &gt; 0; Message proposals (You + prompt versions); Save msg.
- **Analysis** — left: Recommended directions / Mistakes / Proposal score /
  Previous messages score; right (~36% ±50px): conversation with red context
  frame + model select + Send new + numbered run history.

Active mode uses black background / white text. Analysis stays disabled until
a message is selected and a concrete prompt version (not `Open (N)`) is chosen.
Top **Select prompt version** is hidden until a message is selected; options
match the per-message combobox (same builder).

## Data (per user repo via `runWithRepoContext`)

| Item | Path |
|---|---|
| Approach context | `{lead}/approach context` (Text) |
| My proposals | `{lead}/msg workout/my proposals` (Text) |
| Analysis runs | `{lead}/msg workout/{yy-MM-dd}; {schoolId}; {op}` |

These items (and the `msg workout` folder) are created **only on save** —
opening the Message Creator view never writes anything. (Until 2026-07-30 the
GET bootstrap auto-created empty `approach context` / `my proposals` items as
a side effect; users saw them as phantom items they never added.)

Schema v2 runs may include `targetMessageId`, `promptVersionId`, `modelId`,
`runNumber`, `proposalText`. Legacy runs without message target remain readable.

Message IDs: deterministic FNV-1a over `timestamp|sender|raw` (see Story 85).

## API

- `GET /api/leads/message-creator` — bootstrap (messages, prompt versions, models,
  messageRunCounts, allRuns)
- `PUT /api/leads/message-creator` — `{ kind: "approach"|"proposals", leadLoca, text }`
- `POST /api/leads/message-creator/ai` — Send new / school ops (`promptVersionId`,
  `targetMessageId`, `modelId`)

AI returns `PROMPT_NOT_CONFIGURED` / UI **Not configured** until a matching
prompt is published in **Msg Auto → AI Prompts** (Story 88 — see
`../../msg-automation/features/ai-prompts.md`). Bootstrap's `resolvedPrompt`
field shows which published prompt (if any) "Send new" will run; the small
readout next to that button reads it directly — no prompt id is ever
hardcoded in this page. No fake scores. No AI on mount. Beeper Send on
proposals is disabled until outbound send exists.
