# Story 67 — Plan (pending approval, no code written yet)

Status: analysis complete, plan drafted, **awaiting owner approval before any
implementation**. This document answers, in order, the 20 points from
`01_input.md` §21 ("Co masz mi pokazać przed akceptacją").

---

## 1. Story number and path

`backlog/stories/67/` (next free number after 66, per
`documentation/ai-docs/begin_here/03_story-standard.md`).

## 2. Confirmed Dropbox path for Daily Tracker

Verified directly on disk (this Mac's Dropbox client — the same account the
Content Provider mounts on both local Mac and QNAP, see §13 below), **not
guessed**:

```
Cloud-relative path:  /repos/8b603669-f8e6-4224-bd78-a474998995fa/04/02
Local mount path:     /Users/pawelfluder/Dropbox/repos/8b603669-f8e6-4224-bd78-a474998995fa/04/02
```

Confirmed by reading `config.yaml` at each level:

| Path | `type` | `name` |
|---|---|---|
| `.../8b603669.../04` | Folder | **views** |
| `.../8b603669.../04/02` | Folder | **daily** |
| `.../8b603669.../04/02/01` | Text | `01` (body.txt + config.yaml) |

This matches `packages/dba/src/leads.ts`'s hardcoded logical path
`["views", "daily"]` (used by `getAllDailyEntries`/`saveDailyEntry`,
documented in `documentation/dashboard/forms/features/daily-tracker-dates.md`)
exactly — `04` = `views`, `02` = `daily`. The repo GUID
`8b603669-f8e6-4224-bd78-a474998995fa` belongs to the user **`kamil_s`**
(confirmed in the same feature doc). Items `01`–`84` inside are individual
Daily Entry rows, each a `Text` item folder with `config.yaml` + `body.txt` —
exactly the file model in your §6 list. Item `84` (created and deleted
02:01–02:03 on 17.07.2026) is gone from disk now, consistent with the
reference PDF.

**This confirms one important design question (see open decision #1,
§20):** "Daily Tracker" is not a single global folder — every CHAD user has
their own `views/daily` under their own repo GUID. The hardcoded GUID you
gave is `kamil_s`'s, useful for grounding this analysis, but the real
History → Daily Tracker page must resolve **the logged-in user's own** repo
GUID server-side (same mechanism `getAllDailyEntries()` already uses via
`runWithRepoContext`) — never a client-supplied `repoId`. Flagged as a
decision to confirm, not assumed silently, because it changes who can see
what.

## 3. Reference PDF

Found at `/Users/pawelfluder/Downloads/historia_dropbox_tabela_content_provider.pdf`
(not inside any repo — outside all Claude Code working directories, read
directly since you referenced it as already on disk). Confirms:
- exact column set: `Data, Godzina, Element, Operacja, Obiekt, Uwagi`;
- `Element` = short number (`84`, `01`), never a path;
- same-minute events for one element pre-merged into one row (folder + two
  files created in the same minute → one "Dodanie" row with combined
  `Obiekt`);
- a worked example matching real data: element `84` created 02:01, deleted
  02:03 on 2026-07-17; element `01` edited twice at 11:13 (config.yaml +
  body.txt, same minute); bulk-creation of elements `03`–`83` at 03:36 on
  2026-07-12.

This is the reference for §11 (table shape) and §9 (grouping) — the PDF's
"same-minute merge" is a coarser version of the grouping window this plan
proposes (2–5s, configurable); worth noting the PDF's data was itself
manually pre-grouped per-minute, not a literal spec for the exact window
size.

## 4. Proposed architecture

```
packages/dashboard (Next.js, thin route)
        │  fetch /api/history/...
        ▼
packages/dba  (existing domain layer — the ONLY thing dashboard imports)
        │  new module: src/history.ts
        │  - resolves scope "daily-tracker" → current user's repoGuid + ["views","daily"]
        │    (reuses runWithRepoContext / getCurrentRepoGuid(), same as leads.ts)
        │  - calls dropbox-sync's pure functions directly (in-process, same call stack)
        │  - reads/writes Mongo via dba's existing getMongoDb() (mongo.ts)
        ▼
packages/dropbox-sync  (NEW — plain library, no UI, no HTTP server, no CP calls)
        │  - Dropbox SDK client (auth, cursor sync, revisions, content fetch)
        │  - diff engine, grouping engine, snapshot-decision engine (pure functions)
        │  - Mongo write helpers for history_events / history_snapshots / history_sync_state
        │    (still executed through dba's Mongo connection — dropbox-sync itself
        │     takes a Db handle as a parameter, it does not open its own connection)
        ▼
Dropbox API (cloud) — NOT the local filesystem, NOT the Content Provider's own
mounted copy. dropbox-sync talks to Dropbox's HTTP API directly, using the
cloud-relative path confirmed in §2. It never touches
packages/net-content-provider or the CP-mounted filesystem at all.
```

**Why `dropbox-sync` takes a `Db` handle instead of importing `dba/mongo.ts`
itself:** `packages/dba` is the project's designated single MongoDB entry
point for dashboard-facing code (`mongo.ts`'s own doc comment: "the ONLY
place ... allowed to open a MongoDB connection"). `dropbox-sync` is a new,
lower-level library — cleanest dependency direction is `dashboard → dba →
dropbox-sync`, with `dropbox-sync` staying MongoDB-connection-agnostic
(pure functions + a couple of thin persistence functions parameterized by
`Db`), so it never becomes a second place opening its own Mongo connection.
`dba`'s new `history.ts` is the only caller, and it gets its `Db` from the
existing `getMongoDb()`.

## 5. Library vs. worker — decision

**Recommendation: A — a plain library, consumed by `dba`, with the periodic
trigger implemented as a Next.js `instrumentation.ts` hook in
`packages/dashboard`.**

Reasoning, grounded in what's actually in this repo today:
- There is **no existing background-worker/cron standard** in this project.
  `beeper-sync` is a manually-run, one-shot script (`pnpm beeper:sync`) —
  explicitly documented as "Mac-only, manually-run". `beeper-oplog` is
  designed as a long-running Mongo change-stream consumer but is **not
  deployed anywhere** (blocked on the MongoDB replica-set migration, which
  is itself deliberately not done — see `chad_monorepo_migration` history).
  Neither is a precedent for "add a new always-on container."
- The dashboard container is already a long-lived Node process (`next
  start` in Docker, `next dev` locally) — not serverless. Next.js 15
  supports an `instrumentation.ts` `register()` hook that runs exactly once
  when that long-lived process boots. Starting a `setInterval` there that
  calls `dba`'s new `runDropboxHistorySync()` is the simplest mechanism
  that fits the *existing* runtime, with zero new ports, zero new Docker
  services, zero new compose files to maintain — directly satisfying your
  own instruction not to add a heavy framework or an unneeded container.
- Restart-safety falls out for free: the Dropbox cursor and last-sync state
  live in `history_sync_state` in Mongo, not in process memory — a
  container restart just re-registers the interval and resumes from the
  persisted cursor, exactly like `beeper-sync`'s own `sync_state` model.
- A manual "run sync now" trigger (§13) is then just another `dba` function
  called from a POST route, reusing the exact same `dropbox-sync`
  functions — no separate code path for "manual" vs. "scheduled".

**Rejected: B (separate container/worker).** Would duplicate Mongo
connection handling, need its own Dockerfile/compose service/health check,
and contradicts your own "no separate public port if it can be a library"
framing. Nothing about Dropbox sync's load (one repo folder, at most a few
hundred items) needs process isolation from the dashboard.

**Rejected: C (part of the existing DBA "process")** — `dba` isn't a
process today, it's a library with no process of its own (no CLI daemon,
no server). Framing it as "C" doesn't actually describe anything different
from "A" in this codebase, so A is both the accurate and the simplest
description.

**Open point, flagged for your decision (see §20):** which environment(s)
actually run the periodic interval. Recommendation: enable it only on ONE
environment by default (QNAP prod — the only always-on instance) via a
`DROPBOX_SYNC_ENABLED` env flag, default `false` everywhere else; manual
trigger stays available wherever `DEV_PANEL_ENABLED`/equivalent is on. This
avoids two containers polling `list_folder/continue` on the same cursor
concurrently — harmless to correctness (Mongo unique indexes de-duplicate)
but wasteful and confusing in logs.

## 6. `history_events` — model

Collection in the shared `chad` Mongo database (same instance/database as
every other collection — `contacts`, `messages`, `sync_state`, etc. — per
the project's "one Mongo instance, many collections" convention).

```ts
{
  _id: ObjectId,
  scope: "daily-tracker",              // string, extensible for future scopes
  repoId: string,                      // e.g. "8b603669-f8e6-4224-bd78-a474998995fa"
  loca: string,                        // "04/02" — the tracked folder's numeric loca
  element: string,                     // "84" — short child-folder number, never a path
  fileName: string | null,             // "config.yaml" | "body.txt" | null for folder-level ops
  operation: "added" | "modified" | "deleted" | "moved",
  timestamp: Date,                     // event time (Dropbox's own timestamp, not ingest time)
  dropboxFileId: string | null,
  previousRevision: string | null,
  currentRevision: string | null,
  previousEventId: ObjectId | null,    // for building the diff/snapshot chain
  storageType: "diff" | "snapshot-ref" | "metadata-only",
  linesAdded: number | null,
  linesRemoved: number | null,
  diff: string | null,                 // present only when storageType === "diff" and under size limit
  diffStored: boolean,                 // false + reason below when diff was too large to keep
  diffOmittedReason: "diff-too-large" | "binary" | "retention-expired" | null,
  previousSize: number | null,
  currentSize: number | null,
  contentHash: string | null,          // for dedup (see §9)
  groupId: string,                     // deterministic group key, see §11
  syncRunId: string,
  source: "backfill" | "incremental",
  createdAt: Date,
}
```

## 7. `history_snapshots` — model

```ts
{
  _id: ObjectId,
  scope: "daily-tracker",
  repoId: string,
  loca: string,
  element: string,
  fileName: string,
  versionNumber: number,               // monotonic per (scope, repoId, loca, element, fileName)
  dropboxRevision: string,
  timestamp: Date,
  content: string,                     // full text content — text files only, never binary
  contentHash: string,
  size: number,
  reason: "periodic" | "change-count" | "age" | "deleted" | "size-threshold" | "initial",
  createdAt: Date,
}
```

## 8. `history_sync_state` — model

One document per tracked scope (not per repo — a future multi-repo scope
would still be one state doc per logical folder being tracked):

```ts
{
  _id: ObjectId,
  scope: "daily-tracker",
  repoId: string,
  loca: string,
  dropboxCursor: string | null,
  lastSuccessfulSyncAt: Date | null,
  lastAttemptedSyncAt: Date | null,
  status: "idle" | "running" | "error",
  lastError: { message: string, at: Date } | null,   // message only — never a raw SDK error object, never a token
  backfillStatus: "not-started" | "in-progress" | "completed" | "partial",
  backfillCompletedAt: Date | null,
  monitoredSinceAt: Date,              // when dropbox-sync first started watching this scope
  updatedAt: Date,
}
```

**Indexes (all three collections):**
- `history_events`: unique compound on `(scope, repoId, loca, element, fileName, dropboxFileId, currentRevision)` (idempotency — see §9); `{ scope: 1, repoId: 1, timestamp: -1 }` for the table's default sort; `{ scope: 1, repoId: 1, element: 1, timestamp: -1 }` for the element filter and "find previous version"; `{ groupId: 1 }`; `{ operation: 1 }`.
- `history_snapshots`: unique compound on `(scope, repoId, loca, element, fileName, versionNumber)`; `{ scope: 1, repoId: 1, element: 1, fileName: 1, timestamp: -1 }` for "nearest snapshot before X".
- `history_sync_state`: unique on `(scope, repoId, loca)`.

Collection names deliberately follow the `history_` prefix convention
(mirroring the existing `beeper_events` collection's prefixing style) —
this also avoids any naming collision with the **already-existing**
`sync_state` collection (used by `beeper-sync`, unrelated) by choosing
`history_sync_state`, not reusing `sync_state`.

## 9. Diff generation & storage

- On every `modified` event for a tracked file: fetch previous revision
  content + current revision content via Dropbox's
  `/files/download` (rev-scoped), compute a line-based text diff
  (Node's `diff` package — small, no native deps, MIT-licensed, no need for
  anything heavier), keep only the diff text + line counts.
- Both temporary full-content downloads are discarded after diff
  computation — never persisted, only the diff (or the periodic snapshot,
  separately).
- Size/line limits (configurable, see §10): if the diff exceeds the
  configured line count or byte size, store `storageType:
  "metadata-only"`, `diffStored: false`, `diffOmittedReason:
  "diff-too-large"`, plus `linesAdded`/`linesRemoved`/`previousSize`/
  `currentSize` (still computable even when the diff text itself is
  dropped).
- `contentHash` (SHA-256 of the fetched content) stored on both events and
  snapshots — used to skip writing an identical snapshot if the content
  hash matches the most recent stored snapshot (protects against Dropbox
  emitting a revision bump with byte-identical content, which does happen
  for metadata-only touches).
- Binary files are never diffed or snapshotted — out of scope per your
  instruction; `fileName` allowlist (see §6 of input, `config.yaml`,
  `body.txt`/`body`/`body.yaml`/`body.json`) is enforced before any content
  fetch is attempted at all, so non-text files in the folder are skipped
  entirely (their `added`/`deleted` folder-level events are still recorded
  as `metadata-only`, just never diffed).

## 10. Snapshot rules

Configuration (single source of truth — proposed location
`packages/dropbox-sync/src/config.ts`, read via `process.env` with
defaults, same lazy-read pattern as `dba/src/mongo.ts`/`client.ts` — env
vars, not hardcoded, and not scattered across files):

```ts
HISTORY_SNAPSHOT_MAX_CHANGES = 25        // DROPBOX_SYNC_SNAPSHOT_MAX_CHANGES
HISTORY_SNAPSHOT_MAX_AGE_DAYS = 7        // DROPBOX_SYNC_SNAPSHOT_MAX_AGE_DAYS
HISTORY_SNAPSHOT_CHANGE_RATIO = 0.30     // DROPBOX_SYNC_SNAPSHOT_CHANGE_RATIO
HISTORY_DIFF_MAX_LINES = 500             // DROPBOX_SYNC_DIFF_MAX_LINES
HISTORY_DIFF_MAX_BYTES = 100_000         // DROPBOX_SYNC_DIFF_MAX_BYTES
HISTORY_GROUPING_WINDOW_SECONDS = 3      // DROPBOX_SYNC_GROUPING_WINDOW_SECONDS
HISTORY_DIFF_RETENTION_MONTHS = 12       // DROPBOX_SYNC_DIFF_RETENTION_MONTHS
```

A snapshot is created when **any** of: no base snapshot exists yet for that
`(element, fileName)`; ≥25 diff-events since the last snapshot; ≥7 days
since the last snapshot; the file/element was deleted (snapshot the last
known full content before recording the deletion); the current change's
diff represents >30% of the file's line count. All five conditions are
pure, unit-testable functions taking `(lastSnapshotMeta, currentChangeMeta,
config)` → `boolean`.

## 11. Grouping rules

Deterministic key: `` `${scope}:${repoId}:${loca}:${element}:${operation}:${Math.floor(timestamp.getTime() / (windowSeconds*1000))}` ``
— i.e., events for the same element + same operation type that fall in the
same rounded time bucket (default 3s, configurable) share a `groupId`. A
folder `added` + its `config.yaml` `added` + its `body.txt` `added`, all
within the window, form one row like the PDF's example. A `deleted`
immediately after (different `operation`) is **never** merged into the same
group, by construction — different operations never share a `groupId`,
avoiding exactly the "two independent operations hidden as one" risk you
called out.

## 12. Backfill approach

Dropbox exposes three genuinely different historical sources, and this plan
does not conflate them:

1. **`/files/list_revisions`** on each currently-existing file — returns
   revision history for files that still exist, typically retained ~30 days
   on a standard/Plus account, up to Dropbox's plan-dependent extended
   version history if enabled (this is an account-level setting, not
   guaranteed — `dropbox-sync`'s backfill will read whatever
   `list_revisions` actually returns and record it as-is, **never assume a
   fixed retention window**).
2. **`/files/list_folder` with `include_deleted: true`** — surfaces
   currently-deleted entries, but only their *last known state*, not a full
   history of a since-deleted file's own revisions (Dropbox does not
   generally let you pull revision history for a no-longer-existing path
   past a short window).
3. **Full Business/Team audit log API** — a completely different,
   Business-plan-only endpoint (`team_log/get_events`) that isn't available
   on a personal/Plus account at all. This plan **does not depend on it**;
   flagged explicitly here so no future assumption creeps in that "we could
   just pull the full audit log" for a personal account.

Backfill procedure: for the tracked folder, recursively list current
children (respecting the file-type allowlist), pull each text file's
`list_revisions`, synthesize `history_events` (best-effort — Dropbox
revisions don't always distinguish "added" vs. "modified" for the oldest
entry, so the oldest available revision per file is recorded as an
`added` event with `source: "backfill"`), and take one `history_snapshots`
entry (`reason: "initial"`) per current file's latest content. This runs
**once**, on first sync for a given scope, as a background job (never
blocking a request — see §5), and is idempotent (safe to interrupt/retry;
`history_sync_state.backfillStatus` tracks `in-progress`/`completed`/
`partial`).

**UI must show, plainly (per your §16):**
- "Historia zaimportowana z Dropbox: od {najstarsza dostępna revision}"
  (from backfill).
- "Historia monitorowana lokalnie od: {monitoredSinceAt}" (from
  `history_sync_state`).
- Any gap between the two is real and shown, not hidden.

## 13. Standard Dropbox account limitations (established, not assumed)

- This project's Dropbox account is a **single personal Dropbox account**
  (the owner's own — `/Users/pawelfluder/Dropbox` on this Mac), which is
  the **same** account the Content Provider itself mounts on both
  environments (`CP_REPOS_HOST_PATH=/Users/pawelfluder/Dropbox` locally,
  `CP_REPOS_HOST_PATH=/share/Dropbox` on QNAP — both documented as "must be
  the parent of a `repos/` folder"). Every CHAD user's repo (regardless of
  which CHAD login they use) is a subfolder of this one Dropbox account —
  there is no per-CHAD-user Dropbox account.
- Consequence: `dropbox-sync` authenticates **once**, as this one Dropbox
  account — not per CHAD user. Which CHAD user's history is being viewed is
  entirely a server-side scope resolution question (§2's open decision),
  unrelated to Dropbox auth.
- Revision retention for a standard/Plus personal account is Dropbox's own
  policy (historically ~30 days unless extended version history is
  purchased) — will be read from the API's actual response, never hardcoded
  as an assumption in code or UI copy.
- Rate limits apply per-app, standard Dropbox API throttling
  (HTTP 429 + `Retry-After`) — handled with backoff (§17), and revision
  content fetches are throttled to a small bounded concurrency (proposed:
  max 4 in flight), never unbounded parallel fetches (explicit requirement,
  §14).

## 14. Dropbox authorization method

- **Scoped app, OAuth2 with offline access (refresh token flow)** — the
  current officially recommended method (Dropbox deprecated long-lived
  non-expiring access tokens for new apps; short-lived access tokens +
  refresh token is the supported pattern). Official SDK:
  `dropbox` npm package (`Dropbox` client, TypeScript types included).
- **Access type: Full Dropbox, not "App folder".** This is a real
  constraint worth calling out: Dropbox's "App folder" permission type
  sandboxes the app into a *new*, dedicated folder under `Apps/<app
  name>/` — it cannot be pointed at an arbitrary already-existing path like
  `/repos/<repoGuid>/04/02`. Since the data already lives outside any App
  folder, the Dropbox app must request **Full Dropbox** access with the
  narrowest available *scopes* (`files.metadata.read`,
  `files.content.read` — read-only, no write scopes at all, since this
  Story does not write back to Dropbox). Path-level restriction (only ever
  reading under `/repos/<repoGuid>/...`) is therefore enforced **in our own
  code**, not by Dropbox itself — flagged plainly as a limitation, not
  hidden.
- **One-time manual setup** (documented step-by-step for you, to run once,
  no password ever shared with the AI or committed):
  1. https://www.dropbox.com/developers/apps → Create app → **Scoped
     access** → **Full Dropbox** → name it (e.g. `chad-dropbox-sync`).
  2. Permissions tab → enable `files.metadata.read`,
     `files.content.read` only. Save.
  3. Settings tab → note **App key** and **App secret** →
     `DROPBOX_APP_KEY` / `DROPBOX_APP_SECRET`.
  4. Run Dropbox's documented OAuth2 authorization-code flow once (a small
     one-off script in `dropbox-sync`, or Dropbox's own
     `https://www.dropbox.com/oauth2/authorize?client_id=...&
     token_access_type=offline&response_type=code` link + a manual
     `curl`/script exchange for the refresh token) — produces a
     **refresh token** that does not expire on its own.
     `DROPBOX_APP_KEY`/`DROPBOX_APP_SECRET`/`DROPBOX_REFRESH_TOKEN` go into
     `.env.local`/`.env.qnap` (gitignored, alongside `MONGO_ROOT_PASSWORD`
     etc. today), never in code, never logged.
  5. `dropbox-sync` exchanges the refresh token for short-lived access
     tokens itself, transparently, on every run (handled by the SDK).
- **Per environment:** since it's the same one real Dropbox account (§13),
  "separate values for local/test/prod" is interpreted as: the **same**
  Dropbox app/refresh token can be reused everywhere (simplest, since it's
  genuinely one account), but each environment's `.env.local`/`.env.qnap`
  still holds its own copy of the value (never shared via a committed
  file), so a compromised TEST env var can be rotated (new refresh token
  generated in the Dropbox console) without touching PROD's. Flagged as
  decision #2 in §20 if you'd rather actually mint 2-3 separate Dropbox app
  registrations for stronger isolation — technically possible, just more
  manual setup for no real security gain given it's one underlying account
  either way.

## 15. DBA endpoints (functional names, per `05_endpoint-rules.md`)

All live in `packages/dba/src/history.ts`, exposed by thin
`packages/dashboard/app/api/history/*` routes (parse request → call one
`dba` function → return JSON, no business logic in the route, matching the
existing convention documented in `05_endpoint-rules.md`):

| `dba` function | Route | Notes |
|---|---|---|
| `getHistoryScopes()` | `GET /api/history/scopes` | Menu list — currently just `daily-tracker`, extensible |
| `getHistoryEvents(scope, filters)` | `GET /api/history/events` | `dateFrom/dateTo/operation/element/fileName/limit/cursor/sort` |
| `getHistoryEventGroup(scope, groupId)` | `GET /api/history/events/[groupId]` | Full group detail (§12 of input) |
| `getHistoryDiff(scope, eventId)` | `GET /api/history/diff/[eventId]` | Gated: full diff only if caller's session resolves to that scope's own repo |
| `getHistoryVersionPreview(scope, element, fileName, atEventId)` | `GET /api/history/version-preview` | Reconstructs snapshot+diffs chain, read-only preview, no restore |
| `getHistorySyncStatus(scope)` | `GET /api/history/sync-status` | Last sync time, cursor age, error, backfill status |
| `triggerHistorySync(scope)` | `POST /api/history/sync` | **Gated**: only when `DEV_PANEL_ENABLED`/equivalent flag is on, or an explicitly-authorized user role — matching existing dev/test-only gating pattern (`compile-time-flags-and-error-box.md`) |

Every one of these resolves `scope` server-side to `(repoGuid, loca)` using
the **current session's** `runWithRepoContext`/`getCurrentRepoGuid()` —
never a client-supplied `repoId`/`loca` (§14 of your input, and consistent
with the existing per-user isolation already proven for Leads/Tracker/Dates).

## 16. UI structure — `History → Daily Tracker`

- New sidebar group entry, styled exactly like the existing `ACTIONS` group
  in `components/shared/sidebar.tsx`: `{ title: "History", href:
  "/dashboard/history", icon: History, badge: null }` — its own top-level
  entry (not nested inside Views — this is a new hub category alongside
  Forms/Views/Statuses/Settings, matching how your own §10 explicitly asks
  for a new main menu, not a variant of an existing one).
- `/dashboard/history/page.tsx` — a hub page structured exactly like
  `/dashboard/views/page.tsx`: internal `type HistoryScope = null |
  "daily-tracker"` state, a menu screen when `null`, else render the scope
  inline. Uses `DashboardPageShell` (`title="HISTORY"`,
  `toolbarSecondRow` for filters, `scroll={false}` since the table has its
  own sticky header + internal scroll, matching Tracker's own pattern).
- Menu screen: one entry, `DAILY TRACKER` (same visual style as the
  existing Views menu buttons you referenced).
- Table screen: columns exactly `Data | Godzina | Element | Operacja |
  Obiekt | Uwagi` (per the PDF), color-coded rows by operation
  (`added`/`modified`/`deleted`/`moved` → distinct `bg-*-100
  dark:bg-*-950/50` classes, same Tailwind convention already used for the
  Tracker group-color header rows) **plus** a small icon/label per
  operation so meaning never depends on color alone (accessibility
  requirement, §11 of input). Toolbar row 2: date range filter, operation
  filter, element filter, fileName filter, refresh button, last-sync-time
  display, "Run sync now" button (rendered only when
  `DEV_PANEL_ENABLED`), "sync in progress" indicator.
- Row click → detail view. Pattern choice: **reuse the Leads
  `details/page.tsx` route style** (a route-based detail page,
  `/dashboard/history/details?groupId=...`, built on `EditorPageShell`,
  `<NavGroup upLevel={...} />` back to the table) rather than an inline
  expand-in-place row, since your input explicitly asks for "podobnie do
  wzorca używanego w Leads" and the detail payload (diff, metadata,
  snapshot info) is substantial enough to want its own scrollable page, not
  a cramped inline expansion.
- Detail page shows: timestamp, element, operation, grouped file list, full
  relative Dropbox path (masked to `repos/{repoId}/...` — never the
  Mac/QNAP absolute host path), before/after revision, before/after size,
  added/removed line counts, unified diff (`-`/`+` lines, monospace,
  scroll-contained), Dropbox metadata (revision id, content hash),
  `syncRunId`, whether a snapshot exists and why, plus "Pokaż snapshot
  bazowy" / "Odtwórz podgląd wersji" actions (both read-only previews — no
  restore-to-Dropbox/CP button in this Story, per your explicit
  instruction).

## 17. Test plan

**Unit** (`packages/dropbox-sync`, Vitest/plain `node:test` — matching
`dba`'s existing `.test.ts` convention, e.g. `repo-access.test.ts`,
`headers-parser.test.ts`): element-from-path normalization, Dropbox
operation → CHAD operation mapping, diff generation + size/line limiting,
each of the 5 snapshot-decision predicates independently and in
combination, grouping key + window-boundary edge cases (event just inside
vs. just outside the window), no-false-grouping across different
operations, idempotency (same Dropbox event/revision processed twice →
same document, no duplicate insert — via the unique index, exercised
against a real in-memory/throwaway Mongo), version reconstruction
(snapshot + N diffs → expected content, including a missing-previous-
revision edge case handled as a documented gap, not a crash).

**Integration:** real (throwaway, per the project's established "plain
`docker run mongo:7`, never the shared local-mac-docker volume" convention
— see `chad_monorepo_migration` memory) Mongo instance: event/snapshot
insert with the unique indexes actually enforcing no-duplicates on a
repeated batch; cursor only updated after a batch is durably written;
sync-state survives a simulated restart; API filtering/pagination against
seeded fixture data; scope-to-repo authorization (a session for one user
cannot fetch another user's `history_events`); no arbitrary
`repoId`/`loca` accepted from the client; log output inspected to confirm
no token/secret ever appears.

**UI:** table renders per the PDF's shape; every filter; grouping display
(expand to see grouped sub-events); detail page fields; diff rendering;
loading/empty/error states via the existing `ErrorBox`; dark mode; desktop
+ mobile viewport; internal-only scroll (no page-level scrollbar,
consistent with `responsive-layout-standard.md`).

**End-to-end fixture scenario** (a small **dedicated test folder in the
same real Dropbox account**, not production data — e.g.
`/repos/<a throwaway test repoGuid>/99/99`, created for this Story's
testing only): create element `84`-equivalent, add `config.yaml`, add
`body.txt`, edit `body.txt`, delete the element — verify readable grouped
rows, correct diff on the edit, a snapshot captured before deletion,
version-preview reconstruction of the last live version, and no duplicate
rows after re-running sync against the same cursor twice.

## 18. Deployment plan

- **Local Mac (no Docker):** `dropbox-sync` runs in-process inside
  `next dev`'s dashboard server via the same `instrumentation.ts` hook;
  gated off by default (`DROPBOX_SYNC_ENABLED` unset/false) so it doesn't
  start hammering the real Dropbox account every time a dev server
  restarts — manual trigger via the dev-only POST route for local testing.
- **Local Docker (`03_local_mac_docker`):** same mechanism, env vars added
  to `.env.local.example`/`.env.local` (`DROPBOX_APP_KEY`,
  `DROPBOX_APP_SECRET`, `DROPBOX_REFRESH_TOKEN`,
  `DROPBOX_SYNC_ENABLED`, the config values from §10) — **no new
  docker-compose service, no new port**, since it lives inside the existing
  `dashboard` container.
- **QNAP TEST / QNAP PROD:** same — new vars added to
  `.env.qnap.example`/`.env.qnap`, consumed by the existing
  `01_config.sh`/`write_content_provider_appsettings`-style env-injection
  the dashboard container already goes through (no new script slot needed;
  this is app-level config, not a deploy-process change). Per §5's open
  point, `DROPBOX_SYNC_ENABLED=true` proposed for QNAP PROD only by
  default.
- **Health/status:** `history_sync_state` already gives an inspectable
  status; a small addition to the existing Dev Panel
  (`compile-time-flags-and-error-box.md`'s panel) to surface last-sync-time
  and last-error for the `daily-tracker` scope, reusing the existing
  gated-visibility mechanism (`DEV_PANEL_ENABLED`) rather than inventing a
  new diagnostics surface.
- **No image-tagging/build-process changes** — this is application code
  inside the existing `dashboard` image, follows the existing
  `image-tagging-standard.md` process unchanged.

## 19. Files / packages to touch (for implementation phase — not created yet)

- **New:** `packages/dropbox-sync/` (package.json, `src/`: `client.ts`
  (Dropbox SDK wrapper + auth), `cursor-sync.ts`, `diff.ts`,
  `snapshot-rules.ts`, `grouping.ts`, `normalize.ts` (Dropbox event →
  CHAD operation/element), `history-store.ts` (Mongo read/write helpers,
  takes `Db` as a parameter), `config.ts`, `types.ts`, `*.test.ts` files).
- **New:** `packages/dba/src/history.ts` (scope resolution, orchestration,
  the 7 functions in §15), `history.test.ts`.
- **Changed:** `pnpm-workspace.yaml` — none needed (`packages/*` glob
  already covers a new flat package).
- **Changed:** `packages/dashboard/package.json` (add `dropbox-sync` +
  `dba` already present), `packages/dashboard/instrumentation.ts` (new),
  `packages/dashboard/next.config.ts` (maybe: `transpilePackages` add
  `dropbox-sync` if it's also TS-source-consumed like `dba`).
- **New routes:** `packages/dashboard/app/api/history/**`.
- **New UI:** `packages/dashboard/app/(dashboard)/dashboard/history/page.tsx`,
  `.../history/details/page.tsx`.
- **Changed:** `components/shared/sidebar.tsx` (new `History` group entry).
- **Changed env files:** `.env.local.example`, `.env.qnap.example` (+ your
  own real `.env.local`/`.env.qnap`, not committed).
- **New docs:** `documentation/dashboard/history/features/daily-tracker-history.md`,
  `documentation/dba/features/history.md` (per
  `feature-documentation-rules.md`), this Story's own files.
- **Not touched:** `packages/net-content-provider` (per your explicit
  instruction — this feature reads Dropbox directly, never the CP API, for
  history data).

## 20. Risks and open decisions — resolved (owner decision, 2026-07-17)

Presented via the four questions above; all four resolved to the
recommended option:

1. **Scope-to-user mapping — RESOLVED: logged-in user's own repo.**
   "History → Daily Tracker" resolves `scope: "daily-tracker"` to the
   **current session's own** repoGuid + `["views","daily"]`, exactly like
   the existing Tracker/Dates isolation (`runWithRepoContext`/
   `getCurrentRepoGuid()`). The `kamil_s` GUID from the original input was
   grounding for the path analysis only, never a fixed target. No
   admin/diagnostic-only mode for a specific user's data.
2. **Which environment runs the periodic sync — RESOLVED: QNAP PROD
   only.** `DROPBOX_SYNC_ENABLED=true` set only in the QNAP PROD env file
   by default; local Mac and QNAP TEST get manual-trigger only (via the
   DEV/TEST-gated `POST /api/history/sync`).
3. **Dropbox app registration count — RESOLVED: one shared app.** A
   single Dropbox App Console registration (`chad-dropbox-sync`), one
   refresh token, copied into each environment's own `.env.local`/
   `.env.qnap` (not shared via a committed file) — simplest, since it's
   one real underlying Dropbox account regardless.
4. **Story scope — RESOLVED: one Story (67), staged.** Stage 1
   (`dropbox-sync` + Mongo history, backend-only, verifiable via direct
   API calls before any UI exists) implemented and reviewed first, then
   Stage 2 (UI). Stage 3 (restore-to-Dropbox/CP) stays a deliberately
   deferred future Story, not built now.

**Still genuinely open (not owner-decision items, just real unknowns that
implementation will surface, not block on):**

- **Standard account revision retention is unknown until tested** — the
  backfill's real depth for `01`/`02`'s edit history (relevant to the
  original "did we lose data" concern) can only be established by actually
  calling `list_revisions` against the real account during Stage 1. No
  number is promised up front.
- **Diff library:** proposing the small `diff` npm package (Myers diff, no
  native bindings) for `packages/dropbox-sync`. Will proceed with this
  unless flagged otherwise during implementation review.
- **`instrumentation.ts` is a new pattern for this codebase** — an
  officially supported, stable Next.js 15 feature, but no existing
  page/route uses it yet here; will be validated against this project's
  Docker (`output: "standalone"`) build early in Stage 1, before the rest
  of the sync-trigger code depends on it.

## Recommendation on scope: one Story, three staged parts

Given the size of this request, **recommend keeping ONE Story (67) for the
whole feature**, explicitly staged as:

- **Stage 1 — `dropbox-sync` + Mongo history (backend only).** Package,
  Dropbox auth, cursor sync, diff/snapshot/grouping engines, Mongo
  collections + indexes, `dba/src/history.ts`, DBA endpoints, backfill,
  Dev Panel status surface, full unit/integration test suite, real
  end-to-end fixture test against a throwaway Dropbox test folder. No UI
  yet — verifiable via direct API calls / a script, same way
  `daily-tracker-dates.md`'s original save/read round-trip was verified
  before any UI existed.
- **Stage 2 — `History → Daily Tracker` UI.** Sidebar entry, hub page,
  table, filters, detail page, diff rendering, dark mode / mobile
  verification, manual-sync trigger UI.
- **Stage 3 — later, separate follow-up (not this Story):** an actual
  "Przywróć" (restore-to-Dropbox/CP) feature, deliberately **excluded**
  from Stage 1/2's scope per your own instruction. Recorded here as a
  known, intentional future step, not silently dropped.

This mirrors exactly how `daily-tracker-dates.md` itself was actually
built (backend proven end-to-end first, styling/UI polish after) and lets
you approve/verify Stage 1 independently before Stage 2's UI work starts,
without needing two separate Story numbers.

**No implementation starts until you approve this plan** (and resolve/accept
the defaults proposed for the open decisions in §20 above).
