# Story 85 — Plan

Status: **DONE — implemented locally (image `260725_005647`). No TEST/PROD deploy in this Story.**

## Goal

Replace Story 84’s two-pane form UI with mockup-aligned **Beeper / Analysis**
modes on the same route, with message-level analysis targeting and prompt
version selection.

## Decisions

1. **Message IDs** — WhatsApp export text has no native stable IDs. Use
   deterministic FNV-1a over `timestamp|sender|raw` (occurrence suffix only on
   collisions within the same body). Do not use list index alone.
2. **Prompt versions** — extend Message Creator config with
   `listMessageCreatorPromptVersions()` (display names like `SD-PL_v2`). Not
   hardcoded to three in UI.
3. **LLM models** — seed `listMessageCreatorModels()` (no project-wide OpenAI
   model registry yet). Side panel model select uses this list.
4. **Runs** — schemaVersion 2 front-matter adds `targetMessageId`,
   `promptVersionId`, `modelId`, `runNumber`, optional `proposalText`. Legacy
   runs remain readable without message targeting.
5. **Single option builder** — `buildMessagePromptVersionOptions(counts, versions)`
   shared by row combobox and top select.
6. **Send proposal** — Beeper send not implemented → Send disabled / Not
   configured (no fake success).
7. **Approach / Reports** — Approach via compact dialog; Reports via optional
   dialog; remove Level-1/Level-2 tabs from main UI.

## Layers

| Layer | Change |
|---|---|
| `dba/whatsapp-messages.ts` | Pure parse + stable IDs + analysis context frame helper |
| `dba/message-creator.ts` | Prompt versions, models, counts, v2 runs, Send new |
| API | Bootstrap fields; AI accepts message/prompt/model |
| `BeeperConversationView` | Row actions, selection, context frame, no action selects in mini |
| `message-creator/page.tsx` | Full UX rewrite |

## Out of scope

- Mentor prompt / real OpenAI completion
- TEST/PROD deploy
- Migrating or deleting legacy analysis docs
