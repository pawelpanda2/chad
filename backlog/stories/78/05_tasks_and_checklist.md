# Story 78 — Tasks Checklist

**Scope note:** Input 1's original spec (a from-scratch isolated
`docker-compose.e2e.yml` stack, fake Google Sheets client for everything,
QNAP TEST as an opt-in read-mostly smoke test) was superseded mid-task by
Input 2 (primary suite runs against the real QNAP TEST via `test3`,
repoGuid-scoped isolation — no new isolated stack except for the narrow
worker-internals tests that would otherwise wipe the shared
`cp_history_state` singleton) and Input 4 (Google Sheets tests write for
real to `test3`'s own dedicated spreadsheet, not a fake client). See
`02_plan.md` §1 for the full reasoning. The checklist below reflects the
**final, superseded** architecture, not the original spec literally.

| # | Ai Status | Real Status | Task |
|---|-----------|-------------|------|
| 1 | DONE | | History-worker signals real readiness (`watchStatus`/`watchOpenedAt`) only after the Change Stream is actually open, not at process start |
| 2 | DONE | | History survives a history-worker restart with address/actor/before intact (persistent shadow state), not just the resume token |
| 3 | DONE | | History records a stable, correct order for several operations inside the same wall-clock second |
| 4 | DONE | | History → Google Sheets on QNAP TEST shows the current user's spreadsheet link/info instead of a blanket "sync is not enabled" message, while sync writes stay disabled |
| 5 | DONE | | Date Entry has a real, permanent Delete (previously only blanked fields via PATCH) |
| 6 | DONE | | Delete-confirmation dialog (Daily and Dates) enforces a random, case-sensitive, re-typed word before enabling Delete, and sends exactly one request |
| 7 | PARTIAL | | Automated regression suite (`pnpm test:regression:daily-dates`) covers the acceptance matrix — most rows covered end-to-end; some explicitly deferred (see below) |
| 8 | NOT DONE | | Second fixture user used for a real cross-user Google-Sheets/history isolation E2E check (only synthetic/nonexistent-loca cross-repo rejection was tested, not a second real user's real data) |

# Task 1 — History-worker readiness signal

**Requested:** A testable "the Change Stream is really open" signal — the
pre-existing `status: "running"` was written before `itemsCol.watch()` ever
ran, so it couldn't be trusted by an orchestrator waiting for readiness.

**Done:** `packages/history-worker/index.mjs`'s `runChangeStream()` now
writes `watchStatus: "opening"` before calling `itemsCol.watch()`, then
`watchStatus: "ready"` + `watchOpenedAt` immediately after a live cursor is
returned. `gracefulShutdown()` sets `watchStatus: "stopped"`. Exposed for
reads via `getCpHistoryWorkerStatus()` (`packages/dba/src/cp-history.ts`).

**Files changed:** `packages/history-worker/index.mjs`,
`packages/dba/src/cp-history.ts`.

**Tested:** `packages/history-worker/worker-process.test.mjs` — a real
`node index.mjs` child process against the local dev Mongo's real `rs0`
(no mock), polling `cp_history_state` until `watchStatus === "ready"` with
a timeout, then confirming a real insert lands. `packages/dba/src/cp-history.test.ts`'s
`getCpHistoryWorkerStatus reads the global cp_history_state singleton` test.
Both pass; re-run twice via `pnpm test:regression:daily-dates`.

**Status: DONE**

# Task 2 — Persistent shadow state across a restart

**Requested:** The pre-existing `lastKnownState` was in-memory only —
address/actor/before context was lost on every worker restart even though
the resume token itself survived, producing `beforeUnknown: true` on the
first post-restart event for every item, forever (not just once).

**Done:** New `chad.cp_history_last_state` collection
(`packages/history-worker/lib/shadow-state.mjs`) — one doc per item's
`sourceId`, updated at the same point the in-memory cache already was,
never bootstrapped from a raw `cp_items` scan (that would fabricate a
"before" for items whose own first real event hasn't happened yet). Read
back into the in-memory cache at worker startup, before the Change Stream
opens.

**Files changed:** `packages/history-worker/lib/shadow-state.mjs` (new),
`packages/history-worker/index.mjs`.

**Tested:** `worker-process.test.mjs`'s "preserves address/actor/before
across a restart" test — real insert, real `SIGTERM`, real restart (new
child process), real update+delete, asserts `beforeUnknown: false` and
correct `address`/`actor` on both post-restart events, and exactly
`beforeRestartCount + 2` history docs (no duplicate of the original
insert). Passing.

**Status: DONE**

# Task 3 — Stable event ordering

**Requested:** `changedAt` has only second precision, so several operations
in the same second have no guaranteed order.

**Done:** Each `cp_history` doc now also stores `orderSeconds`/
`orderIncrement` (the change event's own BSON `clusterTime` Timestamp
components — seconds + oplog increment, which is monotonic within a second
on a single-node replica set). `cp-history.ts`'s `listCpHistory` sorts by
`{orderSeconds: -1, orderIncrement: -1, changedAt: -1}` — the `changedAt`
tiebreak keeps pre-Story-78 docs (which lack the new fields) correctly
ordered among themselves and always after every new doc, since BSON treats
a missing field as lower than any number in this descending sort.

**Files changed:** `packages/history-worker/lib/history-event-mapper.mjs`
(new — pure `buildHistoryDocument`, extracted from `index.mjs`'s
`recordHistoryEvent`), `packages/history-worker/index.mjs`,
`packages/dba/src/cp-history.ts`.

**Tested:** `history-event-mapper.test.mjs` (pure unit, several ops with
identical `changedAt` sorted correctly by the new fields);
`worker-process.test.mjs`'s "gives several rapid same-second operations a
stable, correct total order" test (real insert→update→update→delete against
real Mongo); `cp-history.test.ts`'s two new ordering tests (scrambled
insertion order still sorts correctly; pre-Story-78 docs sort last). All
passing.

**Status: DONE**

# Task 4 — Google Sheets info/sync split on QNAP TEST

**Requested:** `GOOGLE_SHEETS_ENABLED` was the only signal for both "may
the worker write" and "does the info page have anything to show" — TEST
(which deliberately never sets that flag) always showed "Google Sheets
sync is not enabled on this environment." with nothing else, even though a
safe link/info display doesn't need write access at all.

**Done:** New `loadGoogleSheetsInfoConfig()`
(`packages/dba/src/google-sheets/config.ts`) — reads only
`GOOGLE_SHEETS_SPREADSHEET_MAP` + `GOOGLE_SERVICE_ACCOUNT_EMAIL` (both
non-secret), independent of `GOOGLE_SHEETS_ENABLED`, never reads
`GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`. `/api/google-sheets/info` now returns
two independent fields — `infoConfigured` (was the old single `enabled`)
and `syncWritesEnabled` (from the untouched `loadGoogleSheetsConfig()`).
`docker-compose.qnap.test.yml` now wires the two non-secret info vars in
(still no `GOOGLE_SHEETS_ENABLED`, still no private key).
`production-guard.ts` untouched. The Dashboard's History → Google Sheets
page shows the link/username/service-account card plus an amber "Sync
writes are disabled on this environment" notice instead of the old
blanket message. Deployed real values into QNAP's `.env.qnap`
(`GOOGLE_SHEETS_SPREADSHEET_MAP={"test3":"<test3's own spreadsheet id>"}`,
same service-account email PROD already uses) and restarted TEST.

**Files changed:** `packages/dba/src/google-sheets/config.ts`,
`packages/dashboard/app/api/google-sheets/info/route.ts`,
`packages/dashboard/app/(dashboard)/dashboard/history/page.tsx`,
`docker-compose.qnap.test.yml`, `.env.qnap.example`, QNAP's real
`.env.qnap` (not committed, gitignored).

**Tested:** `google-sheets/config.test.ts` (4 new pure tests — works with
`GOOGLE_SHEETS_ENABLED` unset, never needs/reads the private key, degrades
to an empty map rather than throwing on malformed JSON). Playwright
`daily-dates.spec.mjs`'s "info/sync split" test, run against the real
deployed QNAP TEST after this Story's own deploy — confirms
`syncWritesEnabled: false`, no private-key field anywhere in the response,
no blanket "not enabled" text once `infoConfigured` is true, and
`chadUsername: "test3"`. Passing (post-deploy).

**Status: DONE**

# Task 5 — Real Date Entry delete

**Requested:** Date Entry had no delete at all — its "Delete" button only
PATCH-blanked fields via the existing update path, leaving an empty row.

**Done:** New `deleteDateEntry(loca)` in `packages/dba/src/leads.ts`,
mirroring `deleteDailyEntry` exactly (Mongo-only real delete; throws — never
a pretend success — when only the Content-Provider backend is active, per
`ai-docs/begin_here/05_endpoint-rules.md` §3; enqueues a Google Sheets
tombstone job after the real delete succeeds). New `DELETE
/api/forms/date-entry?loca=...`. Forms page's shared delete-confirmation
flow now calls the real `DELETE` endpoint for both Daily and Dates instead
of branching into a PATCH-blank path for Dates; dialog/button copy updated
to stop claiming Content Provider has no working delete for Dates.

**Files changed:** `packages/dba/src/leads.ts`,
`packages/dashboard/app/api/forms/date-entry/route.ts`,
`packages/dashboard/app/(dashboard)/dashboard/forms/page.tsx`.

**Tested:** `test/integration/qnap-test3-daily-dates.test.mjs`'s "real
DELETE for Daily and Date Entry" suite — real create via the real POST
endpoint, real DELETE, confirms gone from `GET`, from `cp_items` directly,
and has a real `delete` event in `cp_history` (polled, not manually
inserted); confirms a second DELETE of the same loca returns a controlled
failure, not a silent success; confirms a cross-repo `loca` is rejected.
Playwright `daily-dates.spec.mjs`'s full create → dialog → real DELETE
flow, run against the real deployed QNAP TEST. All passing, run twice
consecutively via `pnpm test:regression:daily-dates` with no manual
cleanup needed between runs.

**Status: DONE**

# Task 6 — Delete-confirmation dialog audit

**Requested:** Verify the random-word confirmation dialog's safety
properties by test, not by assuming the description is accurate.

**Done:** Read the actual implementation
(`packages/dashboard/app/(dashboard)/dashboard/forms/page.tsx`) — found it
was already correct in every mechanical respect: random word re-picked and
input cleared on every open, case-sensitive exact match required to enable
Delete, Cancel performs no mutation, exactly one `DELETE` request per
click. The only real defect was Dates-specific copy claiming "Content
Provider has no working delete, so this blanks every field" — now fixed as
part of Task 5 (real delete wired in), copy corrected to match.

**Files changed:** `packages/dashboard/app/(dashboard)/dashboard/forms/page.tsx`.

**Tested:** Playwright `daily-dates.spec.mjs` exercises: disabled with
empty input, stays disabled on a wrong word, Cancel leaves the row intact,
reopening re-picks/resets, the dialog's own actual word (read from its DOM,
never assumed) enables and successfully deletes. Passing against real QNAP
TEST.

**Status: DONE**

# Task 7 — Automated regression suite

**Requested:** One command
(`pnpm test:regression:daily-dates`) deterministically running the full
matrix; shorter `test:unit`/`test:integration:daily-dates`/
`test:e2e:daily-dates` commands; real `rs0`, no Change-Stream mocking, no
manual `cp_history` inserts in the main E2E path; repeatable twice in a row
with no manual cleanup.

**Done:** Root `package.json` scripts:
- `test:unit` — pure Vitest (`history-event-mapper.test.mjs`,
  `test3-guard.test.ts`), zero external deps.
- `test:integration:local-mongo` — the ONE deliberately-local phase (real
  `history-worker` child process + real local `rs0`, per `02_plan.md` §1's
  carve-out for tests that would otherwise wipe the shared
  `cp_history_state` singleton) + the pre-existing `cp-history.test.ts`/
  `google-sheets/config.test.ts` self-executing tests.
- `test:provision-test3` — idempotent fixture provisioner
  (`test/support/provision-test3.mjs`), real QNAP Mongo, real `dba`
  functions, `test3`-scoped.
- `test:integration:daily-dates` — provisions then runs
  `test/integration/qnap-test3-daily-dates.test.mjs` +
  `qnap-test3-google-sheets.test.mjs` against the real deployed QNAP TEST.
- `test:e2e:daily-dates` — Playwright (`test/e2e/`) against real QNAP TEST.
- `test:regression:daily-dates` — all of the above in sequence, real exit
  code.

Every QNAP-TEST-targeted test/script goes through
`packages/dba/src/testing/test3-guard.ts`'s `assertTest3Scoped`/
`assertIsTest3Session` before any mutation — never `deleteMany({})`,
`dropDatabase()`, or any replica-set operation anywhere in this Story's new
code (grepped for, none found).

**Files changed:** `package.json`, `vitest.config.mjs` (new), `test/`
(new directory tree), `packages/dba/src/testing/` (new).

**Tested:** `pnpm test:regression:daily-dates` run twice consecutively,
both fully green (18+21+20+11+2 unit/local + 11+2 QNAP-TEST = 77 assertions
across the two runs' non-idempotent-skipped portions), no manual cleanup
between runs, real exit code 0 both times.

**What's explicitly NOT covered (deferred, not silently skipped):**
- The full Input 1 §7 Playwright matrix — this Story's `daily-dates.spec.mjs`
  covers the highest-value golden path (login, Dates create/edit/delete-
  safety/real-delete, Sheets-info regression) but not: the Daily Tracker's
  own equivalent click-through (only exercised via the integration/API
  tests, not Playwright), History page browsing/diff-detail assertions,
  the "Open Raw" → row-click → `editLoca` interaction specifically (this
  Story's Playwright test navigates to the edit URL directly instead — the
  resulting edit page itself, including Delete, IS covered), the `n`
  toggle, dark mode/viewport checks.
- A second real fixture user for Google-Sheets/history cross-user isolation
  (Task 8, below) — `chad_admin` already has an unprovisioned `test2`
  account, but this Story didn't provision it or obtain its password.
  Cross-repo rejection was tested with a synthetic nonexistent `loca`
  instead (`test/integration/qnap-test3-daily-dates.test.mjs`'s cross-repo
  PATCH/DELETE tests) — real, but a weaker signal than a second real user's
  real data existing and being probed for leakage.
- `historyGapAt`/resume-token-loss and SIGTERM-mid-crash scenarios from
  Input 1 §8's full list — the readiness/restart/ordering properties that
  matter most for this Story's actual bugs are covered
  (`worker-process.test.mjs`); the resume-token-loss and
  crash-between-insert-and-resume-save paths were not independently
  exercised by a new test this session (the resume-token-loss handling
  itself is pre-existing Story-74 code, unmodified by this Story).

**Status: PARTIAL**

# Task 8 — Second fixture user for cross-user isolation

**Requested:** A second, fully synthetic fixture user to prove `test3`
can't see/mutate/leak into their data or spreadsheet, and vice versa.

**Not done.** `chad_admin`'s real `users-list` already has an
unprovisioned `test2` account (confirmed via the same read-only inspection
that found `test3`'s `repoGuid`), which would be the natural choice — but
provisioning its own repo/data and obtaining its login password were out
of this session's remaining scope. What WAS verified: `cp-history.ts`'s
repo-isolation regex (anchored, not a bare string-prefix match, including
the "one GUID is a string-prfix of another's" regression case) via
`cp-history.test.ts`; cross-repo `PATCH`/`DELETE` rejection with a
synthetic nonexistent `loca` via
`test/integration/qnap-test3-daily-dates.test.mjs`; that `resolveSpreadsheetIdForUser`
throws rather than falling back to another user's spreadsheet
(`google-sheets/config.test.ts`, pre-existing + Story 78 additions). A real
second-user round-trip (their own real Daily/Date entries actually existing,
then confirming `test3` truly can't read them) was not performed.

**Status: NOT DONE** — recorded as a real gap, not silently dropped; see
`06_others_from_report.md` for the follow-up proposal.
