# Story 74 — Plan

This Story's own `01_input.md` explicitly waived plan-then-approve in favor
of immediate autonomous action ("Nie zaczynaj od nowa... Nie zatrzymuj się
po samym audycie ani po samym planie"), so no plan was presented to the
user for approval before work started. This file records, retrospectively,
the approach actually taken — continuing work already started by Claude
Code, then Copilot, then Cline in earlier sessions, per the follow-up
prompt in `01_input.md`'s continuation.

## Approach

1. **Audit first, trust nothing.** `git status`/`git diff`/`git log`,
   compare every file the follow-up prompt named against what actually
   exists on disk — several prior-agent claims (a completion report in
   `ai-docs/deploy/story-74-final-report.md`, doc paths it referenced)
   turned out not to match reality, so nothing was taken at face value.
2. **Verify the running local stack independently of the source tree.**
   Docker image tags/build timestamps were compared against source file
   mtimes before assuming "the code is fixed" meant "the running container
   reflects it."
3. **Find the real root cause of the user's specific complaint** (a Daily
   Tracker test edit not showing in History) by tracing one concrete
   document through every pipeline stage in the real local Mongo, not by
   guessing from the code.
4. **Fix only what the evidence supported**, in order of what the audit
   surfaced: duplicate History UI route, stale Docker image, a broken
   deploy-script cross-reference, a missing before/after diff view, a
   delete-actor attribution bug found while testing DELETE.
5. **Prove every fix with a real end-to-end test** through the actual
   Dashboard UI/API (not direct Mongo writes) for INSERT/UPDATE/DELETE,
   plus a worker-restart resume-token test, before declaring anything done.
6. **Clean up all test data** (including a prior agent's fabricated
   `test-history-item-001/003` entries) so the user's Daily Tracker and
   History are byte-for-byte back to their pre-session state.
7. **Write this Story's documentation** last, once the verified state was
   known, rather than up front.

## Explicit non-goals (per `01_input.md`)

- No QNAP TEST/PROD deploy, no SSH to QNAP, no shared-Mongo restart.
- No push to origin.
- No `git reset --hard` / discarding of Copilot's or Cline's prior work —
  only additive fixes plus one deletion (an orphaned duplicate page) with
  its reasoning recorded below and in `06_others_from_report.md`.
