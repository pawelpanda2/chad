# Feature: Message Creator (Story 84)

## Purpose

Lead-scoped GUI that places the Beeper conversation beside a two-level
creator panel (You + schools). Extends existing msg-workout / Console AI
flows — does **not** replace the classic `/dashboard/leads/msg-workout`
document editor.

## Route

```
/dashboard/leads/message-creator?leadName=…&leadLoca=…
```

Entry: Lead details → **Open Message Creator**.

## Layout

- Desktop: conversation | creator (~48/52), independent scrolls
- Mobile: stacked conversation above creator
- Shell: `EditorPageShell`

## Level 1 / Level 2

- **You** → My Proposals, My Reports
- **SD-PL** (full title: Social Dynamics Poland) → Conversation Health,
  Capital, Next Message, Improve + **Analyze Full Conversation**
- Additional schools come from DBA seed config (`listMessageCreatorSchools`)

## Data (per user repo via `runWithRepoContext`)

| Item | Path |
|---|---|
| Approach context | `{lead}/approach context` (Text) |
| My proposals | `{lead}/msg workout/my proposals` (Text) |
| Analysis runs | `{lead}/msg workout/{yy-MM-dd}; {schoolId}; {op}` |

Historical `YY-MM-DD; ai bot` and classic workouts are never overwritten.
Optional soft-import of `//you` sections into empty proposals (read-only until Save).

## API

- `GET /api/leads/message-creator` — bootstrap
- `PUT /api/leads/message-creator` — `{ kind: "approach"|"proposals", leadLoca, text }`
- `POST /api/leads/message-creator/ai` — school operations

AI returns `PROMPT_NOT_CONFIGURED` / UI **Not configured** until mentor
prompts are wired. No fake scores.

## Freshness

`conversationHash = sha256(raw body)`. Latest run vs current hash →
Current / Outdated / Not analyzed yet / No data. No AI on render.
