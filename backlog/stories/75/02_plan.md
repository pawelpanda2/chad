# Story 75 — Plan

## 0. Correction of placeholders in the input prompt

The input prompt referenced `ai-docs/start_here/` and implied `$repo_path` would
be substituted — neither was true literally. The actual entry point is
`ai-docs/begin_here/01_ai_start.md` (see `documentation/ai-docs/` → renamed
`human-docs/ai-docs/`... actually confirmed live: `ai-docs/begin_here/`,
top-level of the `chad` monorepo at
`/Users/pawelfluder/03_synch/01_files_programming/08_nodejs/chad`). Read in
full per `01_ai_start.md`'s own reading order: `01_ai_start.md` →
`02_what-and-where.md` → `03_story-standard.md` → `05_endpoint-rules.md` →
`04_deployment-rules.md`.

## 1. Real Daily Tracker data flow (confirmed by reading code, not guessed)

```
Views → TRACKER page (packages/dashboard, client)
  → GET /api/forms/daily-entry
Forms → DAILY ENTRY page (client)
  → POST /api/forms/daily-entry   (create)
  → PATCH /api/forms/daily-entry  (update in place)
  → DELETE /api/forms/daily-entry?loca=... (Mongo-only real delete)
      [packages/dashboard/app/api/forms/daily-entry/route.ts]
  → getCurrentUserFromCookies() + runWithRepoContext(user, ...)
    → dba: saveDailyEntry(itemName, bodyYaml) / updateDailyEntry(loca, bodyYaml)
      / deleteDailyEntry(loca) / getAllDailyEntries()
      [packages/dba/src/leads.ts]
      → if (config.mongoEnabled)           { ...Mongo path... }
      → if (config.contentProviderEnabled) { ...invokeContentProvider... }
```

Confirmed facts (from `human-docs/dashboard/forms/features/daily-tracker-dates.md`
and live code in `packages/dba/src/leads.ts` /
`packages/dashboard/app/api/forms/daily-entry/route.ts`):

- One record = one CP/Mongo Text item under logical path `views/daily`, body
  is schema-less YAML (`yaml.dump(payload)` / parsed with `yaml.load`).
- Field keys are the literal sheet-style column names: `DATE, STATE, TRAINING
  TIME, VERBAL EXERCISES, INFIELD, THEORY, FIELD REVIEW, ACTION TIME,
  OUTINGS, APPROACHES, LONG INTERACTIONS, NUMBERS, FIRST MESSAGES, RESPONSES,
  DATES SET UP, DATES`. Values are un-typed strings.
- Four additional "— AUTO" fields (`PULLS AUTO`, `CLOSES AUTO`, `QUALITY DP
  AUTO`, `QUALITY C AUTO`) are computed server-side on every `GET` from
  Date Entry data — never persisted, never sent to `saveDailyEntry`/
  `updateDailyEntry`. These will **not** be synced to Google Sheets in this
  Story (out of scope — see §7).
- Identity: `itemName` (sequential `01`, `02`, ...) + `loca` (the item's real
  numeric address, assigned once at creation, stable across every later
  `updateDailyEntry` call — updates are always addressed by `loca`, never by
  re-deriving from `DATE`, since `DATE` is not guaranteed unique).
- User/repo identity: `getCurrentRepoGuid()` via `AsyncLocalStorage`
  (`packages/dba/src/repo-context.ts`), populated by `runWithRepoContext`
  from the session-resolved user — never from request query/body.
- Write shape: `saveDailyEntry` = create (find-or-create folder chain, new
  Text item, `Put` body). `updateDailyEntry` = `GetItem`-then-`Put` on the
  same `loca` (true update in place, not a new item). `deleteDailyEntry` =
  real delete, Mongo-only (Content Provider's own `Delete` is a
  non-functional stub — confirmed in the doc above).
- One dashboard save call = exactly one dba call = at most two underlying
  writes today (Mongo + Content Provider, per `config.mongoEnabled`/
  `config.contentProviderEnabled` — both already dual-backend per
  `human-docs/dba/provider-migration-audit.md`, the only 6 fully-migrated
  functions in the whole `dba` package).
- Right integration point: **inside** `saveDailyEntry`/`updateDailyEntry`/
  `deleteDailyEntry` in `packages/dba/src/leads.ts`, as one more `if
  (config.googleSheetsEnabled) { ... }` block — exactly the shape the user's
  prompt specifies. Zero Dashboard changes needed; Dashboard already only
  calls these three `dba` functions and never sees Content-Provider/Mongo
  details, so it likewise never needs to see Sheets details.

## 2. Existing infra found (why Variant B, and why *not* reusing `data-outbox.ts` directly)

Story 72 already built a full generic outbox for follower-backend writes:
`packages/dba/src/data-outbox.ts` (Mongo collection `data_sync_outbox`,
statuses `pending/processing/retry/synced/failed/conflict`, backoff schedule
`RETRY_BACKOFF_MS`, stale-lock recovery, idempotent enqueue) +
`data-outbox-worker.ts` (claim/execute/retry loop) + `data-router.ts` (primary/
follower selection) + `data-sync-diagnostics.ts` (shadow-read mismatch log,
secret-free). Per `human-docs/dba/provider-migration-audit.md`, this
infrastructure is fully built, tested, and **currently unused by any real
business function** — the 6 migrated `leads.ts` functions were deliberately
kept on a plain inline `if(mongoEnabled)/if(contentProviderEnabled)` instead
of routing through it.

This is strong precedent for Variant B (outbox), matching the user's
explicit preference ("Preferowany, jeżeli repo ma już wzorzec workerów,
kolejek... błędów lub retry" — it does).

**Why not reuse `data-outbox.ts`'s types directly:** its job/command shape
(`DataWriteCommand`, `CpCompatibleDataProvider`, conflict detection by
comparing `CpItem.config.address/type/name`) is built around **replaying a
CP-shaped write command against another CP-shaped provider** (Mongo ↔
Content Provider — both understand `getItem`/`getByNames`/`executeWrite`
returning a `CpItem`). Google Sheets is not a `CpCompatibleDataProvider`: a
spreadsheet row has no `address`/`type`/`id` in the CP sense, and forcing it
into that interface would mean fabricating meaningless `CpItem` fields just
to satisfy the type. Instead: a **new, parallel, purpose-built outbox**
(`packages/dba/src/google-sheets/outbox.ts`) that copies the exact same
proven *shape* (status enum, `attempts`/`nextAttemptAt`/`lockedAt`/
`lockedBy`/`lastError`, `claimNextJob`/`markSynced`/`markRetry`/
`recoverStaleLocks`), and literally re-imports `RETRY_BACKOFF_MS`/
`STALE_LOCK_MS` from `data-outbox.ts` rather than redefining them — but with
a job payload shaped for "upsert one row identified by a stable record key",
not a generic CP write command.

**Job identity — one job per write, not one job slot per record:** each job
`_id` is a fresh `operationId` (UUID), not the record's key. Each job's
payload is a **complete field snapshot** at the time of that write, so
applying it is idempotent regardless of replay/retry, and applying several
queued jobs for the same record in creation order (the worker's `claimNextJob`
already sorts by `nextAttemptAt` ascending) converges to the same final row
state the real edits produced — no lost-update race between "a new edit
arrives while the previous job is mid-flight" (considered and rejected: an
earlier draft of this design reset one shared job-per-record back to
`pending` on every edit, which could let a slow in-flight write for an old
snapshot silently mark a newer snapshot as `synced` without ever writing it
— rejected for that reason).

**Duplicate-row prevention** is handled by the target row lookup, not by the
job queue: the Sheets client always resolves the target row by searching the
stable-key column for `recordKey`, and updates that row in place if found,
appends a new row only if not found. Retrying the identical job is therefore
naturally idempotent (same key → same row → same values written again).

**Wiring the worker into a live process** is deliberately left undone, for
the same reason `data-outbox-worker.ts` itself is undone today (per the
audit: "process placement... is a deploy-time decision, out of this Story's
scope") — the module is complete, independently invocable, and tested; which
long-running process actually calls `runGoogleSheetsSyncWorker`/
`drainGoogleSheetsSyncOnce` on an interval is a deploy-time decision recorded
as a follow-up in `06_others_from_report.md`, not implemented here (no PROD/TEST
deployment is in scope for this Story either way).

## 3. Google Sheets access method

No existing Google Sheets integration in the repo. One existing unrelated
Google integration was found and read:
`packages/beeper-sync/sync-google-contacts.mjs` — a personal OAuth2 "Desktop
app" flow (browser consent + locally-cached refresh token) for the Google
**People** API, used interactively by the repo owner. Wrong shape for a
server-side, unattended sync job (it requires a one-time interactive browser
consent per machine) — **not reused**, but its raw-`fetch`-based style (no
Google SDK dependency) is followed for consistency and to avoid adding the
large `googleapis` package to `packages/dba`, which currently has a lean
dependency list (`dotenv`, `js-yaml`, `mongodb`).

Chosen approach: **Google Sheets API v4 + a service account**, called via
plain `fetch` (Node 18+ built-in) — no new npm dependency:

- `packages/dba/src/google-sheets/service-account-auth.ts` — signs a JWT
  (`RS256` via Node's built-in `crypto.createSign`, no external JWT library)
  and exchanges it for an access token at Google's token endpoint
  (`grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer`), caching the
  token in memory until shortly before expiry (same refresh-before-expiry
  pattern as `sync-google-contacts.mjs`'s `getAccessToken()`).
- `packages/dba/src/google-sheets/sheets-api-client.ts` — the real
  `GoogleSheetsClient` implementation: `values.get` (read header row + key
  column), `values.update` (write an existing row in place by name-mapped
  column), `values.append` (add a new row).
- `packages/dba/src/google-sheets/fake-sheets-client.ts` — in-memory fake
  implementing the same interface, used by every test and available as an
  explicit dependency-injection seam so no test ever talks to a real Google
  account.

Scope required for the service account: `https://www.googleapis.com/auth/spreadsheets`
(read+write to Sheets only — no Drive scope requested, since the sheet is
shared directly with the service account's email, not created/discovered by
it).

## 4. Config

New, independent config module (not mixed into
`data-providers/config.ts`, which is specifically the Mongo/Content-Provider
primary+follower config — Sheets is a third, unrelated follower with its own
enable flag, per the user's own pseudocode
`if (config.googleSheetsEnabled) { ... }`):

`packages/dba/src/google-sheets/config.ts`, read lazily (same reason as every
other config loader in this package — Next.js collects page data at build
time before docker-compose injects runtime env):

```
GOOGLE_SHEETS_ENABLED=false                      (default false — safe/off)
GOOGLE_SHEETS_SPREADSHEET_ID=                     (required if enabled)
GOOGLE_SHEETS_DAILY_TRACKER_SHEET_NAME=            (required if enabled, NO
                                                     default — forces every
                                                     environment file to name
                                                     its own tab explicitly,
                                                     see §6)
GOOGLE_SERVICE_ACCOUNT_EMAIL=                      (required if enabled)
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=                (required if enabled;
                                                     literal "\n" sequences
                                                     are un-escaped to real
                                                     newlines before use)
```

Validated once per `loadGoogleSheetsConfig()` call (same pattern as
`data-providers/config.ts`'s `validateDataProvidersConfig`): if
`GOOGLE_SHEETS_ENABLED` is true, every other var must be present and
non-empty, or it throws a clear, specific error naming exactly which var is
missing — never a generic "not configured".

## 5. Record identity / stable key

`recordKey = "${repoGuid}:${loca}"`. Chosen over `itemName` (sequential,
reused across repos) or `DATE` (not guaranteed unique — confirmed in
`daily-tracker-dates.md`) because `loca` is exactly the value
`updateDailyEntry` already requires callers to hold onto for addressing
updates — it is CHAD's own existing stable identity for this record, assigned
once at creation, never re-derived. `repoGuid` is prefixed for readability/
diagnostics and as defense-in-depth if two repos' `loca` values were ever
compared side by side in the raw Mongo outbox collection — not because
`loca` alone is ambiguous (it already includes the repo's own address
prefix in Mongo-backend addresses, but not in the raw CP `loca` string).

## 6. Sheet layout & schema evolution

Fixed technical columns (written by name, first-time header init only):
`CHAD_RECORD_KEY, CHAD_REPO_GUID, CHAD_ITEM_NAME, CHAD_LOCA,
CHAD_CREATED_AT, CHAD_UPDATED_AT, CHAD_SCHEMA_VERSION, CHAD_SYNC_STATUS`
followed by the domain columns in their existing documented order (`DATE,
STATE, TRAINING TIME, VERBAL EXERCISES, INFIELD, THEORY, FIELD REVIEW,
ACTION TIME, OUTINGS, APPROACHES, LONG INTERACTIONS, NUMBERS, FIRST
MESSAGES, RESPONSES, DATES SET UP, DATES`) — this fixed order is used
**only** to seed headers into a brand-new empty sheet/tab.

For every read/write after that, columns are resolved **by header name**,
never by position:
- Missing header for a column CHAD needs → append a new column at the end,
  never reflow/renumber existing ones.
- Reordered columns → unaffected (name lookup).
- Extra manual columns added by the user → left completely alone, never
  read or written by CHAD.
- Row lookup for update/delete-mark is always by the `CHAD_RECORD_KEY`
  column's value, never by row index.
- `CHAD_SCHEMA_VERSION` is written per-row; a future breaking change to the
  column set would show up as an old value in existing rows — no migration
  logic beyond that in this Story (flagged as a real, deliberate limitation
  in `06_others_from_report.md`, not implemented — "nie twórz ciężkiej
  infrastruktury, jeśli proste rozwiązanie... wystarczy").
- Multi-environment isolation: `GOOGLE_SHEETS_DAILY_TRACKER_SHEET_NAME` has
  **no default value** — every environment's own env file must name its own
  tab explicitly (e.g. `daily-tracker-local`, `daily-tracker-test`,
  `daily-tracker-prod`, or entirely separate `spreadsheetId`s), so a
  copy-pasted config can't silently point two environments at the same tab.

`CHAD_SYNC_STATUS` is `ACTIVE`/`DELETED` — `deleteDailyEntry` marks the row
`DELETED` in place rather than physically removing it (matching the existing
CP convention elsewhere in this feature of never truly deleting rows/items,
and avoiding row-index shift hazards).

## 7. Explicitly out of scope for this Story

- Date Entry (`Views → DATES`) sync — structurally identical, deliberately
  left as a follow-up (same shape of change, but the prompt's task title and
  the bulk of its detail is "Daily Tracker"/Daily Entry specifically; adding
  a second target now would double the surface without explicit ask).
- The four "— AUTO" computed columns — never persisted server-side today;
  syncing them would require also fetching every Date Entry on every Daily
  Entry write, a materially bigger change than "mirror what's actually
  stored".
- Wiring the worker into any long-running process/cron/deploy script.
- Any real Google Cloud project/service account/spreadsheet creation, or
  sharing a real sheet with a service account email — needs the user's own
  Google account decision + real spreadsheet ID (asked for, not guessed).
- TEST/PROD deployment.
- Bidirectional sync (Sheets → CHAD) — not requested.

## 8. Test plan

All tests follow the existing `packages/dba` convention (no test framework —
hand-rolled `test()`/`assert()` runner, compiled via `tsc` then run with
`node dist/<file>.test.js`; Mongo-touching tests point `MONGODB_URI` at the
already-running local `chad-mongodb-local-mac-docker` container, same as
`data-outbox.test.ts`):

1. `google-sheets/mapper.test.ts` (pure, no Mongo) — Daily Entry fields →
   sheet row mapping; technical columns; header-name resolution incl.
   missing/reordered/extra-manual-column cases.
2. `google-sheets/config.test.ts` (pure) — enabled+fully configured;
   disabled; enabled-but-missing-each-required-var (one case per var);
   confirms the error message never contains the actual secret value.
3. `google-sheets/outbox.test.ts` (real local Mongo, own collection) —
   enqueue/claim/markSynced/markRetry backoff/stale-lock recovery/idempotent
   retry — mirrors `data-outbox.test.ts`'s structure for the new collection.
4. `google-sheets/worker.test.ts` (real local Mongo + `FakeGoogleSheetsClient`)
   — create-new-row, update-existing-row-by-key, delete-marks-status,
   retry-after-simulated-client-failure-then-succeeds, disabled config short-
   circuits without touching the fake client at all, a primary-write failure
   never happens because of Sheets (the enqueue call itself is wrapped so it
   can never throw into the caller), manual/unknown columns in the fake
   sheet's header row are preserved untouched after an update.
5. A repo-context isolation check (two different `repoGuid`s produce two
   different `recordKey`s / never see each other's queued jobs) — covered as
   part of `worker.test.ts` using `runWithRepoContext` with two fake users.

Google API itself is never called in any automated test — only
`FakeGoogleSheetsClient`. No real spreadsheet is created or written to by
this Story.
