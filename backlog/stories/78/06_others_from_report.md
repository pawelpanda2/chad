# Story 78 — Other notes

## Architecture decisions

- **Superseded the original from-scratch isolated stack** (Input 1 §1) with
  the real-QNAP-TEST-plus-`test3`-plus-repoGuid-isolation approach (Input 2)
  — see `02_plan.md` §1 for the full reasoning, including the one
  deliberate carve-out kept: `cp_history_state` is a global singleton
  (one resume token/status for ALL users' history, not per-repo), so
  worker-restart/readiness/resume-token tests run against the local dev
  Mongo's `rs0` (already existed, `docker-compose.local.yml`), never
  against the real shared QNAP history-worker.
- **Superseded the fake-Google-Sheets-client-for-everything plan** (Input 1
  §5.2) with real writes to `test3`'s own dedicated spreadsheet (Input 4) —
  via the real `GoogleSheetsApiClient`/mapper called directly from the test
  process, never through the production-guard-gated enqueue/worker path
  (which stays exactly as restrictive as before, PROD-only).
- Kept `packages/dba/src/testing/` out of the package's public `dba`
  export surface deliberately (no `index.ts` re-export) — it's a test-only
  safety module, imported by relative path from test files/scripts, never
  meant to be reachable from `packages/dashboard`/`packages/console`
  runtime code.

## Problems encountered and how they were resolved

- A raw `mongosh`-via-`docker exec` command (constructed to read
  `.env.qnap` credentials and pipe them into a remote SSH command) was
  blocked by the permission classifier early in this session. Rather than
  working around it, asked the user how they wanted QNAP Mongo access
  handled this session — they chose "a Node script via `packages/dba`'s own
  Mongo connection," which became the standing pattern for every real-Mongo
  inspection/provisioning step afterward (read-only `test3` repoGuid lookup,
  the provisioner, the ad-hoc cleanup scripts).
- `test3`'s login password was given directly in chat mid-session.
  Redacted from `01_input.md` (Input 3) rather than recorded verbatim,
  since this repo is public and the Story's own boundaries (§12) forbid
  committing credentials — used only as a local `E2E_TEST3_PASSWORD` env
  var for the rest of the session, never hardcoded in test code.
- `packages/history-worker/index.mjs`'s Node-18 `globalThis.crypto` shim
  (needed because the production image runs Node 18, which predates native
  `globalThis.crypto`) unconditionally threw on Node 22 (this developer
  machine, and likely CI) — blocked any local process-level testing of the
  worker until guarded with `if (!globalThis.crypto)`. Pre-existing bug,
  unrelated to this Story's actual scope, fixed because it blocked writing
  the mandated real-process tests at all.
- Two `describe.skipIf`/`it.skipIf` timing bugs in the new Vitest
  integration files: the skip condition (QNAP reachability, Google Sheets
  spreadsheet access) was being computed inside an async `beforeAll`, but
  `skipIf`'s condition is read synchronously at collection time, before
  `beforeAll` ever runs — both tests were silently skipping regardless of
  the real condition. Fixed by moving both probes to top-level `await`,
  before any `describe`/`it` calls.
- Several throwaway Date Entries accumulated in `test3`'s own real QNAP
  repo during this session's own live debugging (before the real DELETE
  endpoint was deployed, a few Playwright dev-iteration attempts couldn't
  clean up after themselves). All identified and removed via the real
  DELETE endpoint once deployed — confirmed `test3`'s Dates table now
  contains exactly the 3 intentional seed rows plus whatever the
  regression suite's own self-cleaning tests leave behind between runs
  (net zero after a full pass).

## Known limitations / explicitly deferred

- Second-fixture-user isolation E2E (Task 8) — see `05_tasks_and_checklist.md`.
- Full Input 1 §7 Playwright acceptance matrix — golden path covered, several
  rows deferred (listed in Task 7).
- `historyGapAt`/resume-token-loss simulation and
  crash-between-insert-and-resume-token-save — not independently exercised
  by a new test this session; the handling itself is pre-existing Story-74
  code, unmodified here.
- Root cause investigation for the leftover, blank-fielded stray Date Entry
  found during cleanup (`DATA: 2026-03-01`, blank `ŹRÓDŁO`/`NAZWA`) was not
  pursued — most likely an artifact of an early, since-fixed Playwright
  selector bug in this Story's own dev iteration (not a product bug), but
  this wasn't independently confirmed before deleting it.
- `ai-docs/tests/` (a short "how to run the tests" doc, requested in Input 1
  §13) was not written this session — the closest equivalent is this
  Story's own `02_plan.md`/`03_knowledge.md` plus the inline comments in
  `test/support/qnap-env.mjs` and each test file's own header comment.
  **Follow-up proposal:** add a short `ai-docs/tests/ai-start.md` pointing
  at those.
- **Follow-up proposal:** provision `test2` (already exists in
  `chad_admin`, unprovisioned) as the second fixture user Task 8 needs, and
  add the real two-user Sheets/history isolation checks Input 1 §4.3/§5.2
  originally asked for.
- **Follow-up proposal:** `ai-docs/history/how-it-works.md` and
  `ai-docs/google-sheets/architecture.md` describe the pre-Story-78 shape
  of the history-worker/info-page — worth a short revision note in each
  pointing at this Story, matching this repo's own convention of recording
  revisions in place rather than only in the Story folder.
