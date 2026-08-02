# Msg workout ↔ Beeper linking — read this first

Status: created 2026-08-01 (Story 99). This is **only the reading-order
index** for `ai-docs/msg-workout/` — same convention as
`ai-docs/begin_here/01_ai_start.md`, `ai-docs/beeper/ai-start.md`,
`ai-docs/deploy/ai-start.md`. It does not describe any standard itself.

## What this specialization covers

Linking a lead's `msg workout` Content Provider items (per-lead Text items
under `leads/all items/<leadName>/msg workout/`) to the **specific Beeper
message** each workout is actually about, and surfacing that link in
`/dashboard/beeper` → Conversations. Read this before touching:

- `packages/dba/src/msg-workout-matching.ts` (pure matching engine)
- `packages/dba/src/msg-workout-linking.ts` (`config.links.beeper` read/write)
- `packages/dba/src/msg-workout-proposals.ts` (CP proposal tree storage)
- `packages/dba/src/msg-workout-analyze.ts` (orchestration)
- `packages/dba/src/msg-workout-gui-data.ts` (read-only GUI aggregation)
- `packages/dashboard/app/api/msg-workout/**`
- `packages/dashboard/components/beeper/msg-workout-*.tsx`,
  `undated-msg-workouts.tsx`

**Not this specialization**: creating/editing msg workout items themselves
(that's `leads.ts`'s `createMsgWorkoutForLead`/`saveMsgWorkout`, documented
in `human-docs/dba/features/msg-workout-new.md`); linking a *lead* to a
whole Beeper *conversation* (that's Story 90's
`packages/dba/src/lead-beeper-links.ts`, the Msg Auto → Links page — this
Story reads from it, never writes to it); the Message Creator AI-analysis
feature (`packages/dba/src/message-creator.ts`) — a different, older
consumer of the same `whatsapp-messages.ts` parsing utilities.

## 1. Reading order

1. **This file.**
2. [`architecture.md`](architecture.md) — module map, CP+Mongo data flow,
   how this fits into the existing `Dashboard → API → dba → CP/Mongo`
   layering.
3. [`beeper-linking.md`](beeper-linking.md) — the `config.links.beeper`
   schema, and why the stable identifier is Mongo's `_id`, not the
   content-hash id the GUI otherwise uses.
4. [`matching-rules.md`](matching-rules.md) — all 4 matching stages, exact
   semantics, edge cases.
5. [`proposal-schema.md`](proposal-schema.md) — the YAML proposal shape,
   statuses, storage location, idempotency/dedup rule.
6. [`gui-integration.md`](gui-integration.md) — marker, expandable panel,
   Undated section; why the GUI never runs matching itself.
7. [`tests.md`](tests.md) — what's covered where (pure vs. Postgres
   integration vs. verified live in the Story 99 pilot).

## 2. Code entry points, not just docs

- `packages/dba/src/msg-workout-analyze.ts`'s `analyzeMsgWorkoutsForLead` —
  the one function that ties matching + both write paths together for one
  lead. `analyzeNewMsgWorkoutsForCurrentUser` is the safe, current-user-only
  batch form (never all users — see `matching-rules.md`'s "batch" note).
- `POST /api/msg-workout/analyze-lead` and
  `GET /api/msg-workout/conversation-links` — the only two HTTP endpoints;
  both thin adapters (`ai-docs/begin_here/05_endpoint-rules.md` §2).
- `packages/dba/src/msg-workout-matching.test.ts` — pure engine tests, no
  I/O. `packages/dba/src/msg-workout-cp.test.ts` — real local-Postgres
  integration tests (throwaway repoGuids, same convention as
  `leads-postgres.test.ts`).

## 3. Related documentation outside this folder

- `ai-docs/beeper/ai-start.md` — Beeper CRM architecture this Story reads
  from (`getBeeperContact`, `beeper_<repoGuid>` isolation).
  `ai-docs/beeper/mongo-schema.md` documents the `messages` collection this
  Story's `messageId` comes from.
- `packages/dba/src/lead-beeper-links.ts` (Story 90) — lead↔conversation
  resolution this Story reuses read-only.
- `human-docs/dba/features/msg-workout-new.md` — how a `msg workout` item
  itself is created/named (`generateWorkoutName`'s `YY-MM-DD[suffix]`
  convention, which `matching-rules.md`'s Stage 2 parser mirrors).
- `backlog/stories/99/` — this Story's full history (input, plan,
  knowledge, checklist, pilot results).
