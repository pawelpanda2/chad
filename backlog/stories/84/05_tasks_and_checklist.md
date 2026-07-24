# Story 84 — Tasks and checklist

| # | Ai Status | Real Status | Task |
|---|-----------|-------------|------|
| 1 | DONE | | Message Creator route shell + lead entry point |
| 2 | DONE | | Extract shared Beeper conversation view; embed in Creator |
| 3 | DONE | | Responsive two-pane / stacked layout with independent scrolls |
| 4 | DONE | | Approach context load/save (per lead) |
| 5 | DONE | | Level-1 perspectives (You + dynamic schools; SD-PL full title) |
| 6 | DONE | | You → My Proposals (dedicated item + soft //you import) |
| 7 | DONE | | You → My Reports (DBA finder, empty state, openable) |
| 8 | DONE | | School Level-2 tabs UI + status badges (no fake scores) |
| 9 | DONE | | Analyze Full Conversation action UI + result surface |
| 10 | DONE | | DBA analysis-run model + `saveAnalysisRun` + freshness hash |
| 11 | DONE | | Thin API routes (bootstrap, approach, proposals, single AI) |
| 12 | DONE | | OpenAI boundary stub (`PROMPT_NOT_CONFIGURED`) server-side only |
| 13 | DONE | | English user-facing copy audit |
| 14 | DONE | | Isolation/security pass on all new routes |
| 15 | DONE | | Automated + manual regression matrix (§16 in plan) |
| 16 | DONE | | human-docs feature note for Message Creator |

---

## Implementation notes (2026-07-24)

- DBA: `packages/dba/src/message-creator.ts` (+ unit tests for hash/naming/freshness/soft-import).
- API: `GET|PUT /api/leads/message-creator`, `POST /api/leads/message-creator/ai`.
- UI: `/dashboard/leads/message-creator`; CTA on lead details; `BeeperConversationView` shared with Messages.
- AI: returns **Not configured** / `PROMPT_NOT_CONFIGURED` — no fabricated scores.
- Unit tests: `node dist/message-creator.test.js` — 10 passed.
