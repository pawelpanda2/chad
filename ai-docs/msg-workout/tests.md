# Tests

## Pure unit — `packages/dba/src/msg-workout-matching.test.ts`

No I/O, no CP/Mongo. Covers, per `matching-rules.md`:

- `parseWorkoutName`: day+time, day-only (with/without suffix), undated
  (including Message Creator's own `"; ai bot"` naming, confirming it's
  correctly treated as undated rather than misparsed).
- `dayTimeToUtcDate` (UTC interpretation), `normalizeForExactMatch`
  (CRLF/whitespace collapsing), `parseWorkoutDirectionAndText`
  (`p1_you`/`p1_she`, case-insensitive, no-prefix case), `textSimilarity`
  (identity, max-difference, partial).
- Stage 1: single in-window candidate → linked; outside ±30 min →
  no-candidates; multiple in-window → proposal, never arbitrary; empty
  candidate list → no-candidates.
- Stage 2: exactly one same-day → linked; zero → no-candidates.
- Stage 3: unique exact text+direction → linked; **direction mismatch
  excludes an otherwise-exact-text candidate** (explicit regression test);
  multiple exact matches → proposal (`ambiguous-exact`), never arbitrary.
- Stage 4: no exact match → fuzzy proposal with every candidate's
  confidence backed by named `reasons[]`; no `p1_you`/`p1_she` prefix at
  all still reaches fuzzy (never crashes, never auto-links); the
  direction+text-similar candidate outranks an unrelated one.
- Undated: unparseable name → `undated` regardless of candidates.

21 assertions, all passing (`npx vitest run packages/dba/src/msg-workout-matching.test.ts`).

## Real-Postgres integration — `packages/dba/src/msg-workout-cp.test.ts`

Same convention as `leads-postgres.test.ts`/`admin-users-postgres.test.ts`:
local test Postgres (`postgres://chad:chad@localhost:5433/chad_test_story80_mutate`),
throwaway `randomUUID()` repoGuids per test, `DBA_PRIMARY_BACKEND=postgres`.
**Never the real shared QNAP Postgres, never a real user's repoGuid.**

- `msg-workout-linking.ts`: write → re-fetch from Postgres directly (not
  the in-memory return value) → confirms the write actually persisted;
  idempotent second write with a *different* messageId does **not**
  overwrite; unrelated `config.links.*` entries survive a `links.beeper`
  write.
- `msg-workout-proposals.ts`: write → read/parse round-trip (found and
  fixed a real bug during this Story: `writeProposal` was returning the
  item from *before* its body was written, so a fresh proposal always
  read back empty — caught by this test, fixed, reverified); rerun with a
  different payload never overwrites the original, never duplicates the
  item (`listProposalsForLead` still returns exactly one row); a
  never-analyzed lead's read path never creates an empty
  `links/msg workout/<lead>` folder.
- Cross-user isolation (spec 2.7): two throwaway repoGuids, the identical
  lead name + workout name, completely independent items — proposal
  written under repo A is invisible under repo B and still present under A
  afterward.

5 tests, all passing (`npx vitest run packages/dba/src/msg-workout-cp.test.ts`,
after `set -a && source .env.local && set +a` for local Postgres
credentials — same requirement as the pre-existing `*-postgres.test.ts`
files, confirmed by reproducing the same failure against
`leads-postgres.test.ts` before sourcing the env file).

## Verified live, not via synthetic fixtures

Per `backlog/stories/99/05_tasks_and_checklist.md`'s pilot task: CP
write/read roundtrip, Beeper message lookup, and rerun idempotency were
additionally verified end-to-end against the real
`26-07-27_pn_Klaudia_delfin` lead and its real linked Beeper conversation —
not just the throwaway-repoGuid integration tests above. Cross-user
isolation at the `msg-workout-*` layer itself is structural (every
function goes through `getCurrentRepoGuid()`/`runWithRepoContext`, the same
mechanism `beeper-crm.test.ts` already isolation-tests for the underlying
`getBeeperContact`/Mongo access this Story's `msg-workout-analyze.ts` calls
unchanged) — this Story adds its own explicit isolation test (above) for
the two *new* CP write paths, rather than re-proving Beeper Mongo isolation
that Story 73 already covers.

## Not covered by an automated test (documented, not silently skipped)

- The GUI components (`msg-workout-marker.tsx`, `msg-workout-panel.tsx`,
  `undated-msg-workouts.tsx`, the wiring in
  `beeper-conversations-view.tsx`) have no dedicated unit test — verified
  by manual browser check on LOCAL/TEST (see Story 99's checklist) instead,
  consistent with how `beeper-conversations-view.tsx` itself (Story 94) has
  no component test either; only its pure logic (`beeper-conversations-logic.ts`)
  is unit-tested.
