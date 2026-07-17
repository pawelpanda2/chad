# Beeper CRM — migration plan & status

Migrates the standalone `contacts` project (packages: `beeper-sync`,
`beeper-oplog`, `beeper-ws`, `dashboard`) into this monorepo. See
`architecture.md` for the target architecture and `mongo-schema.md` for the
collection shapes.

## What "done" means here

This migration has two independent halves:

1. **Code migration** (this repo's `packages/*` and `documentation/*`) —
   **done**, described below.
2. **Data migration** (the owner's actual Beeper message history, formerly
   living only in the standalone `contacts` project's MongoDB) —
   **done locally** (Story 59, 2026-07-15/17): applied to `chad`'s own local
   Mongo (`docker-compose.local.yml`'s `mongodb` service, database
   `beeper`), verified idempotent (re-running reports 0 to insert), indexes
   recreated, dashboard read+write paths re-verified against the migrated
   data. **QNAP is not yet migrated** — that's Story 59 Phase 3, still
   gated on explicit go-ahead. See "Running the data migration" and
   `backlog/stories/59/` for the full record.

## Code migration — what moved and how

| Source | Target | Changes made |
|---|---|---|
| `contacts/packages/beeper-ws` | `chad/packages/beeper-ws` | `dotenv` path changed from repo-root `.env` to `.env.mac-beeper` (matching the already-prepared `.env.mac-beeper.example`); `WS_URL` and Mongo URI made env-driven (`BEEPER_WS_URL`, no more hardcoded `localhost:23373`) |
| `contacts/packages/beeper-sync` | `chad/packages/beeper-sync` | Same `.env.mac-beeper` change across all scripts; two diagnostic scripts (`inspect-api.mjs`, `inspect-empty-response.mjs`) had a real pre-existing bug (`resolve(__dirname, ...)` with no `__dirname` defined in an ESM file) fixed; hardcoded macOS SQLite paths (`~/Library/Application Support/BeeperTexts/{index,account}.db`) now read `BEEPER_SQLITE_PATH` / `BEEPER_SQLITE_ACCOUNT_PATH` env vars first, falling back to the old hardcoded path for zero-config Mac use; `package.json` scripts renamed to match the README's documented names instead of the old `dev:*`-prefixed names that had drifted from it (the "rozjazd" flagged in `documentation/ai-docs/deploy/2026-07-10_decision-beeper-mac-qnap-architecture.md` section 5) |
| `contacts/packages/beeper-oplog` | `chad/packages/beeper-oplog` | `dotenv.config()` no longer points at a Mac-only `.env` file (this package runs on QNAP, inside docker-compose, where env comes from the container); Beeper REST metadata-enrichment call made env-driven (`BEEPER_REST_URL`) and documented as best-effort/optional (already failed gracefully in the original code when unreachable — just wasn't configurable) |
| `contacts/packages/dashboard` (SvelteKit, `db.js` + ~20 routes) | `chad/packages/dba/src/beeper-crm.ts` (data access) + `chad/packages/dashboard/app/api/beeper-crm/**` (thin routes) + `chad/packages/dashboard/app/(dashboard)/dashboard/beeper/**` (Next.js/React UI) | Full rewrite (SvelteKit/Svelte 5 → Next.js/React 19), same business logic. See the route-by-route mapping below. |

### Route/page mapping (SvelteKit → Next.js)

| Old (contacts, SvelteKit) | New (chad, Next.js) | Status |
|---|---|---|
| `/contacts` (+`/business`, `/friends` as tag-filtered variants) | `/dashboard/beeper` (tag filter tabs instead of separate routes) | ported |
| `/contacts/[id]` | `/dashboard/beeper/[id]` | ported |
| `/contacts/[id]/export` | `GET /api/beeper-crm/contacts/[id]/export` ("Copy for AI" button) | ported |
| `/inbox` | `/dashboard/beeper/inbox` | ported |
| `/merge` (fuzzy pairwise suggestions) | `/dashboard/beeper/merge` | ported |
| `/api/contacts`, `/api/contacts/search` | `/api/beeper-crm/contacts`, `/api/beeper-crm/contacts/search` | ported |
| `/api/contacts/[id]/profile`, `/tags`, `/events`, `/events/[eventId]`, `/merge` | same shape under `/api/beeper-crm/contacts/[id]/...` | ported |
| `/api/contacts/[id]/avatar` | `/api/beeper-crm/contacts/[id]/avatar` | ported |
| `/api/events` (SSE) | `/api/beeper-crm/events` (SSE) | ported, with a standalone-Mongo polling fallback (see architecture.md) |
| `/affinity` (dating-status-tracking view) | — | **not ported** — a personal, opinionated view over `ratingStatus`/`attractiveness`/etc. fields; those fields are preserved in the schema and in `getBeeperContact`'s output, so this page can be added later without any data-layer work |
| `/api/admin/fix-index` | — | **not ported** — one-off maintenance script for a specific index bug, not a durable feature |
| `/api/merge-suggestions` (Google-enrich, `merge_suggestions` collection) | — | **not ported** — see architecture.md "Known limitations" #4 |
| `/api/media/[...mediaId]` (Mac-local Beeper media proxy) | — | **not ported** — Mac-only, see architecture.md "Known limitations" #3 |
| Avatar cropper UI (`AvatarCropModal.svelte`) | — | **not ported** — v1 avatar editing is via the `avatarURL` field only; a full cropper UI can be added later, no data-layer changes needed |
| `sync-google-contacts.mjs` (beeper-sync pipeline step) | migrated as-is (it's a `beeper-sync` script) | code ported unchanged; the dashboard-side consumer of its output was not (see above) |

### New things added beyond a straight port

- `dba.ensureBeeperIndexes()` — idempotent index creation, so the dashboard
  alone (without ever running `beeper-sync`/`beeper-oplog`/`beeper-ws`
  first) is enough to bootstrap a fresh database's indexes.
- `bash-scripts/beeper/{01_config,02_begin,03_end,04_status,05_sync}.sh` —
  begin/end/status process management for `beeper-ws` (PID-file based, no
  tmux dependency needed for a single process) and a `05_sync.sh` wrapper
  for `beeper-sync`, both following this repo's existing bash-scripts
  conventions (`bash-scripts/common/lib.sh`, MongoDB reachability
  preflight via `bash-scripts/mongo/health-check-mac.sh`).
- `bash-scripts/mongo/migrate-contacts-to-chad.mjs` — the data migration
  script (see below).

## MongoDB schema/indexes/relations — analysis

Done — see `mongo-schema.md`. Summary: 7 collections
(`contacts`, `channels`, `messages`, `timeline_events`, `sync_state`,
`beeper_events`, `merge_suggestions`), all going into the shared `chad`
MongoDB *instance*, but a separate **`beeper` database** within it — not
the `chad` database. This was explicitly decided in Story 59 Phase 0: one
shared instance/container, but two separate logical databases (`chad` for
CHAD/dashboard and the future Content Provider `content_provider_files`
model; `beeper` for everything on this page), to minimize change/risk by
keeping the `beeper` name and shape exactly as the `contacts` project
already had it. (An earlier version of this doc, and of
`.env.mac-beeper.example`, said "database `chad`" — that was superseded by
the Phase 0 decision and has been corrected.)

## Running the data migration

`bash-scripts/mongo/migrate-contacts-to-chad.mjs` (wired up as
`pnpm mongo:migrate-contacts` / `pnpm mongo:migrate-contacts:apply`):

- **Read-only against the source.** Never writes to the `contacts`
  project's database.
- **Insert-only against the target**, and only for documents whose `_id`
  doesn't already exist there — never updates or deletes anything already
  in the target. Preserves original `_id` values so cross-collection
  references (`channelID`, `contactID`, `mergedInto`, `mergedFrom`) stay
  valid.
- **Defaults to dry-run** (`pnpm mongo:migrate-contacts`) — reports counts,
  writes nothing. Pass `--apply` to actually write.
- **After a successful `--apply`**, it now also calls
  `dba.ensureBeeperIndexes()` against the same target automatically (Story
  59) — indexes are no longer a manual step you have to remember.

```bash
# 1. Dry run first — always.
CONTACTS_MONGODB_URI="mongodb://<user>:<pass>@localhost:27018/beeper?authSource=admin&replicaSet=rs0&directConnection=true" \
MONGODB_URI="mongodb://<user>:<pass>@localhost:27017/beeper?authSource=admin" \
pnpm mongo:migrate-contacts

# 2. Review the counts, then actually write:
CONTACTS_MONGODB_URI="..." MONGODB_URI="..." pnpm mongo:migrate-contacts:apply
```

**Local run — done (Story 59, 2026-07-15/17).** Source =
`contacts`'s own MongoDB (Mac Docker container `mongodb`, host port 27018 —
that project moved off 27017 to avoid colliding with `chad`'s own Mongo).
Target = `chad`'s local Mongo (`chad-mongodb-local-mac-docker`, port
27017), database `beeper`. Final state, confirmed via direct count and a
clean idempotent re-run:

| Collection | Source | Target |
|---|---|---|
| `contacts` | 152 | 152 |
| `channels` | 170 | 170 |
| `messages` | 3644 | 3644 |
| `sync_state` | 336 | 336 |
| `beeper_events` | 57 | 57 |
| `timeline_events` | 0 | 0 |
| `merge_suggestions` | 0 | 0 |

Re-running the dry-run reports **0 to insert, 0 conflicts** — fully
idempotent. Indexes recreated on the target (`identities_senderID_unique`,
`tags_1` on `contacts`; `beeperChatID_1`, `participantIDs_1`,
`lastMessageAt_-1` on `channels`; `beeperMessageID_1_network_1`,
`channelID_1_timestamp_-1`, `channelID_1_timestamp_1_isSelf_1`,
`contactID_1_timestamp_-1` on `messages`; `contactID_1_timestamp_1` on
`timeline_events`).

**QNAP run — not done.** Same script, just point `MONGODB_URI` at QNAP's
`chad-mongodb` (test range first) instead of the local target. Sequence
stays: dry-run against QNAP, inspect counts, `--apply` against QNAP test,
verify, then QNAP prod — each step gated on explicit go-ahead, per this
repo's standard local → local Docker → QNAP test → QNAP prod rollout
order. See `backlog/stories/59/02_plan.md` Phase 3.

## Local runtime — how to run it (Story 59)

Everything below runs entirely from `chad`; nothing depends on the
standalone `contacts` repo (verified by Story 59 Task 3 — see
`backlog/stories/59/05_tasks_and_checklist.md`).

- **Config:** root `.env.local` (Mongo credentials, `MONGODB_URI` used by
  the dashboard via `docker-compose.local.yml`), plus `.env.mac-beeper`
  (gitignored — copy from `.env.mac-beeper.example`) for `beeper-ws`/
  `beeper-sync`: `MONGODB_URI` (same local Mongo, database `beeper`),
  `BEEPER_API_KEY`, `BEEPER_WS_URL`, `BEEPER_REST_URL`.
- **Dashboard:** `bash-scripts/dashboard/03_local_mac_docker/07_deploy.sh`
  (or `04_re-start.sh` for an env-only restart) — reads `beeper` data
  exclusively through `packages/dba`, never connects to Mongo directly from
  a route handler.
- **`beeper-ws`** (Mac-only, long-lived): `bash bash-scripts/beeper/02_re-start.sh`
  to start, `03_end.sh` to stop, `04_status.sh` for full status (Mongo
  reachability + `beeper` collection counts, Beeper Desktop reachability,
  process state, last error — no secrets printed). Preflights both Mongo
  and Beeper Desktop before starting; refuses to start (clear error, not a
  crash) if either is unreachable. Requires Beeper Desktop running locally.
- **`beeper-sync`** (Mac-only, manual/cron): `bash bash-scripts/beeper/05_sync.sh`
  for an incremental REST sync (default — never force/full unless you pass
  `--force`, `--sqlite`, or `--all` explicitly). Same Mongo+Desktop
  preflight as `beeper-ws` (skipped for `--sqlite`, which never calls the
  REST API).
- **Migration re-run** (idempotent, safe to re-run any time to catch up on
  new `contacts` data before a full cutover): `pnpm mongo:migrate-contacts`
  (dry-run) / `pnpm mongo:migrate-contacts:apply`, pointed at the local
  target — see "Running the data migration" above.

**Known limitation:** an actual incremental REST sync run and a real live
WS event were not exercised end-to-end this pass — both need Beeper
Desktop open, which could not be launched from the automated session that
did this work (see `backlog/stories/59/06_others_from_report.md`). The
preflight/config path up to that point (Mongo reachable, scripts fail
clean without Beeper Desktop rather than crashing) is verified.

## Blockers / remaining work

1. **QNAP data migration not executed** (see "Running the data migration"
   above — done locally, QNAP is Story 59 Phase 3, gated on explicit
   go-ahead).
2. **`beeper-oplog` cannot be deployed to QNAP until the MongoDB replica-set
   migration is re-attempted and approved** (see architecture.md — this was
   already a known, deliberately-deferred blocker before this migration
   started, not introduced by it).
3. **Media proxy not ported** (Mac-only feature, needs a product decision
   on how to serve attachments to a QNAP-hosted dashboard — see
   architecture.md "Known limitations" #3).
4. **`/affinity` view, avatar cropper UI, and Google-enrich merge
   suggestions not ported** — all schema-compatible, can be added later
   without data-layer changes (see the route mapping table above).
5. **`dba`'s beeper-crm layer is now runtime-verified** (2026-07-12,
   follow-up session): ran every exported function (`ensureBeeperIndexes`,
   `listBeeperContacts`, `getBeeperContact`, profile/tags/timeline-event
   mutations, `searchBeeperContacts`, `getBeeperMergeSuggestions`,
   `mergeBeeperContacts`, `getBeeperInbox`, `getBeeperDashboardStats`,
   `exportBeeperContactForAI`, `subscribeToBeeperChanges`) against a
   throwaway, isolated local MongoDB (`docker run mongo:7`, no shared
   volume, removed afterward) seeded with sample contacts/channels/messages.
   All passed. **Found and fixed one real bug** carried over from the
   source project: `getBeeperContact` could list the same direct channel
   twice in its `channels` array (see the `dba: fix duplicate direct
   channel...` commit) — not user-visible today since the UI doesn't render
   that array, but a genuine correctness bug now fixed.
   **Still not runtime-tested:** the Next.js API-route layer (only
   statically verified via `tsc --noEmit` + `next lint`, both clean — a
   live `next dev` + browser click-through was not done this pass) and
   `beeper-ws`/`beeper-sync`/`beeper-oplog` (need a real Beeper Desktop
   instance, Mac-only, not available in a coding session). Before relying
   on the UI in production: run `pnpm dashboard` against a MongoDB seeded
   via the migration script (dry-run-verified first) and click through
   `/dashboard/beeper`, `/dashboard/beeper/[id]`, `/dashboard/beeper/inbox`,
   `/dashboard/beeper/merge`.
6. **`beeper-sync`'s many one-off diagnostic/repair scripts**
   (`fix-senderid-index.mjs`, `cleanup-ghosts.mjs`,
   `fix-image-attachments.mjs`, etc.) were migrated verbatim (env-path
   fixed). **Re-audited 2026-07-13** beyond the syntax check: checked every
   script for `dotenv.config()` path correctness, hardcoded
   URIs/paths-that-should-be-env, and the `__dirname`-in-ESM bug class found
   earlier — no further issues found. `enrich-contacts.mjs`,
   `diag-setup.mjs`, `inspect-api.mjs`, and `inspect-empty-response.mjs`
   hardcode `http://localhost:23373` rather than reading `BEEPER_REST_URL`;
   left as-is since it matches this repo's documented same-machine
   assumption for Beeper Desktop (these run by hand, on the Mac, next to
   Beeper Desktop). Note `dedup-messages.mjs` defaults to **live** mode
   (deletes duplicates unless `--dry-run` is passed) — the inverse of this
   migration's own `migrate-contacts-to-chad.mjs` convention — but that's
   inherited verbatim from the source project's own tool semantics, not
   something introduced here, and changing a manually-run Mac-side tool's
   default behavior out from under the owner wasn't part of this pass.
