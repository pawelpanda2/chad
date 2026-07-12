# Beeper CRM — migration plan & status

Migrates the standalone `contacts` project (packages: `beeper-sync`,
`beeper-oplog`, `beeper-ws`, `dashboard`) into this monorepo. See
`architecture.md` for the target architecture and `mongo-schema.md` for the
collection shapes.

## What "done" means here

This migration has two independent halves:

1. **Code migration** (this repo's `packages/*` and `documentation/*`) —
   **done**, described below.
2. **Data migration** (the owner's actual Beeper message history, currently
   sitting in a local/standalone MongoDB used by the `contacts` project) —
   **script written, not executed.** Running it requires real MongoDB
   connection strings for both sides and is explicitly the kind of
   irreversible-ish, real-data operation this migration does not perform
   without a live human running it and checking the output. See "Running
   the data migration" below.

## Code migration — what moved and how

| Source | Target | Changes made |
|---|---|---|
| `contacts/packages/beeper-ws` | `chad/packages/beeper-ws` | `dotenv` path changed from repo-root `.env` to `.env.mac-beeper` (matching the already-prepared `.env.mac-beeper.example`); `WS_URL` and Mongo URI made env-driven (`BEEPER_WS_URL`, no more hardcoded `localhost:23373`) |
| `contacts/packages/beeper-sync` | `chad/packages/beeper-sync` | Same `.env.mac-beeper` change across all scripts; two diagnostic scripts (`inspect-api.mjs`, `inspect-empty-response.mjs`) had a real pre-existing bug (`resolve(__dirname, ...)` with no `__dirname` defined in an ESM file) fixed; hardcoded macOS SQLite paths (`~/Library/Application Support/BeeperTexts/{index,account}.db`) now read `BEEPER_SQLITE_PATH` / `BEEPER_SQLITE_ACCOUNT_PATH` env vars first, falling back to the old hardcoded path for zero-config Mac use; `package.json` scripts renamed to match the README's documented names instead of the old `dev:*`-prefixed names that had drifted from it (the "rozjazd" flagged in `documentation/ai-docs/2026-07-10_decision-beeper-mac-qnap-architecture.md` section 5) |
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
database per the already-established "one instance, many collections"
decision (confirmed by the pre-existing `.env.mac-beeper.example`, which
already pointed `MONGODB_URI` at a `chad` database, not a separate `beeper`
database — this migration follows that, not a new decision).

## Running the data migration

`bash-scripts/mongo/migrate-contacts-to-chad.mjs` (wired up as
`pnpm mongo:migrate-contacts` / `pnpm mongo:migrate-contacts:apply`):

- **Read-only against the source.** Never writes to the `contacts`
  project's database.
- **Insert-only against the target**, and only for documents whose `_id`
  doesn't already exist there — never updates or deletes anything already
  in `chad`. Preserves original `_id` values so cross-collection references
  (`channelID`, `contactID`, `mergedInto`, `mergedFrom`) stay valid.
- **Defaults to dry-run** (`pnpm mongo:migrate-contacts`) — reports counts,
  writes nothing. Pass `--apply` to actually write.

```bash
# 1. Dry run first — always.
CONTACTS_MONGODB_URI="mongodb://admin:admin123@localhost:27017/beeper?authSource=admin&replicaSet=rs0" \
MONGODB_URI="<target chad MongoDB URI>" \
pnpm mongo:migrate-contacts

# 2. Review the counts, then actually write:
CONTACTS_MONGODB_URI="..." MONGODB_URI="..." pnpm mongo:migrate-contacts:apply
```

This was **not run** as part of this migration — it needs a real, reachable
target MongoDB (QNAP's `chad-mongodb`, or a local Mac Docker instance for a
first dry run) and the owner's actual source connection string, neither of
which are appropriate to invoke from an unattended coding session against
what may be the owner's only copy of their message history. Recommended
sequence: dry-run against a local Mac Docker `chad` MongoDB first, inspect
counts, then dry-run against QNAP, then `--apply` against QNAP, per this
repo's standard local → local Docker → QNAP test → QNAP prod rollout order.

## Blockers / remaining work

1. **Data migration not executed** (see above — by design, needs a human
   with real credentials).
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
   fixed) but not individually re-audited beyond the syntax check — they
   were already working, narrowly-scoped tools in the source project, and
   the scope of this migration was structural (moving + rewiring), not a
   line-by-line rewrite of every script.
