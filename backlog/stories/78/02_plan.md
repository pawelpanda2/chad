# Story 78 — Plan

## 0. Confirmed facts (targeted audit, 2026-07-23, HEAD `5450021`)

- `test3` already has a real, stable login entry in `chad_admin/users/users-list`
  (Mongo-backed now, not the old Content-Provider-file version the 2026-07-12
  doc described): `repoGuid = 5a9c8b7d-6e5f-4a3b-2c1d-0e9f8a7b6c5d`. **No
  cp_items root repo exists for it yet** (confirmed via a read-only script
  using `dba`'s own `getUsersListBody()`/`getMongoDb()`, connected to QNAP's
  real Mongo over Tailscale, `directConnection=true` — the same pattern
  `01_config.sh`'s `DBA_MONGO_MODE=qnap` branch uses). This repoGuid is the
  `TEST3_REPO_GUID` constant the whole Story hangs off.
- `packages/history-worker/index.mjs`: `lastKnownState` is a plain in-memory
  `Map`, populated only from events observed since process start — confirmed,
  matches Input 1's claim. `watch opened` is logged and the stream is
  returned, but `cp_history_state.status: "running"` is written **before**
  `itemsCol.watch()` even runs (top of `mainLoop`) — no separate
  post-watch-open readiness field exists yet. Resume-token-loss handling
  (`historyGapAt`) already exists and looks correct. `changedAt` is derived
  from `clusterTime`'s seconds component only (`toDate()`) — no
  sub-second/increment component kept, confirming Input 1 §3.5.
- `packages/dashboard/app/api/google-sheets/info/route.ts`: confirmed —
  `if (!config.enabled) return { enabled: false }` is the **entire**
  response when `GOOGLE_SHEETS_ENABLED=false`, which is exactly what's
  deployed on TEST. This one flag conflates "worker may write" and "info
  page has anything to show" — matches Input 1 §5.1 exactly.
- `production-guard.ts`: exactly as documented in `ai-docs/google-sheets/architecture.md`
  §0g — two independent checks (`CHAD_ENVIRONMENT==="prod"`,
  `MONGODB_URI` host allowlist). Not touched by this Story.
- `leads.ts`: `deleteDailyEntry` (line 1590) is a real Mongo delete + Sheets
  tombstone enqueue. **No `deleteDateEntry` exists at all** — `updateDateEntry`
  (line 1659) is the only Date Entry mutation, confirming Input 1's claim
  that Dates' "Delete" button can only ever PATCH-blank fields today.
- `docker-compose.qnap.test.yml`: confirmed — `CHAD_ENVIRONMENT=test`, no
  `GOOGLE_SHEETS_*` vars at all, points `MONGODB_URI` at the same shared
  `chad-mongodb` PROD also uses. No Content Provider service in this file
  (Mongo-only runtime on TEST today).
- Root `package.json` has no test-runner scripts at all today (`dba`,
  `dashboard`, `console`, `beeper:*`, `mongo:*`, `dev` only). Existing test
  files are self-executing `tsc && node dist/x.test.js` style
  (`packages/dba/src/*.test.ts`, `packages/dba/src/google-sheets/*.test.ts`,
  `packages/console/src/migrateCpToMongo.test.ts`) — 19 files total, no
  Vitest/Jest config anywhere yet.
- QNAP TEST deploy is `bash-scripts/dashboard/06_qnap_test_ssh/06_deploy.sh`
  (git preflight — refuses on uncommitted/unpushed changes — then remote
  `04_qnap_test/06_deploy.sh` = build + restart + status). This is the only
  script this Story is allowed to use for the TEST deploy step.

## 1. Architecture decision — superseded by Input 2/Input 4, recorded here so the reasoning isn't lost

Input 1's original spec (§1) asked for a from-scratch isolated
`docker-compose.e2e.yml` (own rs0, own Mongo, fake Sheets) as the **primary**
way to run the whole suite, with QNAP TEST only as an opt-in read-mostly
smoke test. Input 2 reversed this: the primary suite runs against the real,
already-running QNAP TEST (`chad-dashboard-test`, real `chad-mongodb`, real
`history-worker`), using `test3` and repoGuid-scoped isolation as the actual
safety mechanism — because that's what `test3` exists for, and because a
from-scratch stack would just be re-testing infrastructure this repo already
has, not exercising the real deployed history-worker/Change-Stream/Dashboard
pipeline. Input 4 similarly reversed §5.2's "fake Google Sheets client for
everything" — `test3` has its own real, dedicated spreadsheet
(`1d_u_uRa0LILtksc25ATt--jh11mZDm7ABGyjAQuTdIc`, already shared with the
service account by the project owner), so Sheets integration tests write to
that real sheet instead of an in-memory fake.

**One deliberate carve-out kept, not overridden by Input 2:** `cp_history_state`
is a **global singleton** document (`_id: "cp_history_worker"`) — one resume
token/status for the *entire* `chad-mongodb`, shared by every user's history,
not scoped per repoGuid. A subset of Input 1 §3/§8's required tests
(readiness-from-a-clean-state, simulated resume-token-loss/`historyGapAt`,
SIGTERM/restart-with-no-persisted-state, crash-between-insert-and-resume-save)
are inherently about wiping/restarting *that one shared document/process* —
doing that against the real QNAP TEST history-worker would blow away
continuity for `pawel_f`/`kamil_s`'s real history too, which is exactly the
"czyszczenie całej bazy / restart Replica Set"-shaped test Input 2 explicitly
rules out. These specific worker-internals tests run against the **existing**
local dev Mongo (`docker-compose.local.yml`, already has `rs0` per
`ai-docs/history/how-it-works.md` — no new stack needed, just running a
second, disposable `history-worker` process pointed at it) — never against
QNAP TEST. Every other test in the matrix (forms CRUD, AUTO, History content
for `test3`'s own items, delete-safety UI, repo isolation, Google Sheets info
page, real Sheets row sync) runs against real QNAP TEST via `test3`.

**Consequence for `pnpm test:regression:daily-dates`:** it has two phases,
not one monolithic stack boot: (a) a short local-Mongo phase for the worker-
internals unit/process tests (§3/§8 subset above), (b) the QNAP-TEST-targeted
integration + Playwright E2E phase using `test3`, gated by a repoGuid safety
guard on every mutation. Both phases are real (no Change-Stream mocking, no
fake Mongo) — the split is about *which* Mongo, never about faking the
mechanism under test.

## 2. Safety guard (load-bearing for every QNAP-TEST-targeted test)

New shared test helper, `TEST3_REPO_GUID` constant +
`assertTest3Scoped(address)` (throws unless `address === TEST3_REPO_GUID` or
`address.startsWith(TEST3_REPO_GUID + "/")`) — every destructive test helper
(create/update/delete via DBA or HTTP, history queries, Sheets writes) must
call this before performing a mutation. Additionally re-verifies at runtime
(not just trusts the constant) that the logged-in session's `username ===
"test3"` and `repoGuid === TEST3_REPO_GUID` before any destructive call, per
Input 1 §1.2/§12. No `deleteMany({})`, `dropDatabase()`, or replica-set
operations anywhere in the new test code — grepped for and enforced by a
lint-style check in the test harness itself (fails loudly if found).

## 3. Fix plan (root causes, not symptoms)

1. **History-worker readiness**: add `watchOpenedAt`/`watchStatus: "ready"`
   to `cp_history_state`, written only after `itemsCol.watch()` returns a
   live cursor (after the existing `console.log("watch opened")` line).
   Orchestrator/tests poll for this field, with timeout + diagnostic message
   — no `sleep`.
2. **Persistent shadow state**: `lastKnownState` stays in-memory as the fast
   path, but every processed event also upserts a per-item shadow doc into a
   new `cp_history_last_state` collection (keyed by `sourceId`), read back at
   worker startup to seed the in-memory map **only for items the worker
   itself already has real history for** (never a blind full `cp_items`
   scan — that was explicitly rejected in Input 1 §3.4 as producing false
   diffs). Idempotent, updated after the same point in `recordHistoryEvent`
   the in-memory cache already updates at.
3. **Stable ordering**: persist the change stream's own resume-token data
   string (or `clusterTime`'s full BSON Timestamp, including the increment)
   as an explicit sortable field on each `cp_history` doc, used by
   `cp-history.ts`'s list/read functions instead of relying on `changedAt`
   (second precision) alone.
4. **Google Sheets info/sync split**: new `loadGoogleSheetsInfoConfig()` in
   `packages/dba/src/google-sheets/config.ts`, independent of
   `GOOGLE_SHEETS_ENABLED` — reads a spreadsheet-map + optional viewer
   creds for **display only**. `info/route.ts` uses this instead of
   `loadGoogleSheetsConfig().enabled`. Sync-writing config
   (`loadGoogleSheetsConfig`) and `production-guard.ts` stay untouched.
5. **Real `deleteDateEntry`**: mirror `deleteDailyEntry`'s shape exactly
   (Mongo-only real delete, throws on Content-Provider-only backend per
   `05_endpoint-rules.md` §3 — never a pretend success) + `DELETE
   /api/forms/date-entry` + Sheets tombstone enqueue via
   `queueDateEntrySheetSyncIfEnabled`.
6. **UI delete-confirmation audit**: confirm the existing random-word-confirm
   dialog (Input 1 says it already exists for the full editor's Delete
   button) actually enforces case sensitivity/disabled-state/single-request
   correctly — fix only what a failing test proves broken, per Input 1's own
   "don't assume the description is the cause" instruction.

## 4. What this plan intentionally does not build

- No `docker-compose.e2e.yml` (superseded by Input 2).
- No `FakeGoogleSheetsClient`-based integrity path for the main suite
  (superseded by Input 4) — `fake-client.ts` may still back pure
  mapper/layout unit tests that don't need network I/O; nothing new here,
  matches existing test files already using it.
- No changes to `production-guard.ts`'s conditions.

## 5. Order of work

Matches Input 1 §11, adjusted for Input 2/4: safety-guard helper → failing
tests (worker-internals locally, everything else against QNAP TEST via
`test3`) → baseline recorded in Story → fixes → full local Mongo phase green
→ full QNAP-TEST phase green (twice) → secrets/artifact check → commit →
push → `06_deploy.sh` TEST deploy → read-only-by-default QNAP smoke.
