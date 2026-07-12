# Beeper CRM — architecture

Status: implemented in this monorepo (2026-07-12), not yet deployed to a real
Mac/QNAP runtime. Supersedes/implements the plan in
`documentation/ai-docs/2026-07-10_decision-beeper-mac-qnap-architecture.md`
and the "migracja modułów contacts" item that document explicitly deferred.

## What this is

The standalone `contacts` project (a personal Beeper messenger CRM: browse
contacts across Telegram/WhatsApp/iMessage/Signal/etc., merge duplicate
identities, tag contacts, keep manual notes/timeline events, and export a
conversation as Markdown for pasting into an LLM) has been folded into this
monorepo. The standalone project's own dashboard (SvelteKit) is superseded by
a new **Beeper** tab inside `packages/dashboard` (Next.js) — do not run the
old `contacts/packages/dashboard` going forward.

**Not to be confused with:** `packages/dba/src/beeper.ts` and
`packages/dashboard/app/api/beeper/*` / the existing **Messages** sidebar
tab. That is a *different, older* feature — it reads static WhatsApp export
text already stored in Content Provider and matches it against dating leads.
It has nothing to do with MongoDB and nothing in this migration touches it.
The new feature lives under a distinct `beeper-crm` naming scope
(`dba/src/beeper-crm.ts`, `app/api/beeper-crm/*`,
`app/(dashboard)/dashboard/beeper/*`) specifically to avoid colliding with
it.

## Package responsibilities

| Package | Runtime | Role |
|---|---|---|
| `packages/beeper-ws` | **Mac only**, long-lived | WebSocket listener: Beeper Desktop → `beeper_events` collection. Requires a local Beeper Desktop instance. Never deployed to QNAP. |
| `packages/beeper-sync` | **Mac only**, manual/cron | Historical importer: Beeper's local SQLite (`BeeperTexts/index.db`/`account.db`) + Beeper's local REST API → `contacts`/`channels`/`messages`/`sync_state`. Run by hand or via cron, not long-lived. |
| `packages/beeper-oplog` | **QNAP** (once replica set exists), long-lived | MongoDB change-stream consumer: normalizes raw `beeper_events` into `contacts`/`channels`/`messages`. Depends only on MongoDB, never on Beeper Desktop (a REST metadata-enrichment call to Beeper's local API is best-effort and no-ops gracefully when unreachable, e.g. on QNAP). **Requires a MongoDB replica set** (`db.watch()` / change streams) — not deployable until that migration lands (see `documentation/ai-docs/2026-07-10_mongodb-replica-set-migration-plan.md`). |
| `packages/dba` (`beeper-crm.ts`, `mongo.ts`) | wherever the dashboard runs | The *only* code allowed to open a MongoDB connection for this feature. All contact/message/timeline/merge logic lives here, ported 1:1 from the standalone project's `db.mjs`/`db.js` and SvelteKit route handlers. |
| `packages/dashboard` (`app/api/beeper-crm/*`, `app/(dashboard)/dashboard/beeper/*`) | **QNAP** (dashboard's normal runtime) | UI + thin API routes. Calls `dba` functions only — never imports the `mongodb` driver directly. |

This mirrors the existing rule for Content Provider: **the dashboard never
talks to a data store directly, only through `packages/dba`.**

## Runtime topology

```
Mac (owner's laptop):
    Beeper Desktop (external app, not part of this monorepo)
        |  localhost: WS (23373) + REST (23373) + local SQLite
        v
    beeper-ws (long-lived)         beeper-sync (manual/cron)
        |                               |
        +---------------+---------------+
                         | MongoDB URI over Tailscale (100.x.x.x)
                         v
QNAP (s12):
    MongoDB ("chad" database, shared with Content Provider's future
              content_provider_files collection etc.)
        ^
        | internal docker-compose hostname (e.g. "mongodb:27017"),
        | never Tailscale/localhost from QNAP-side processes
        |
    beeper-oplog (long-lived, gated on replica set)
    dashboard (Next.js, via packages/dba)
```

Rules carried over from the prior architecture decision, unchanged by this
migration:
- QNAP-side processes connect to Mongo via the internal docker-compose
  hostname, never Tailscale or a hardcoded IP.
- Mac-side processes (`beeper-ws`, `beeper-sync`) connect via the QNAP
  Tailscale address, never `localhost`.
- MongoDB is never exposed publicly — Tailscale only.
- No hardcoded IPs/localhost/absolute paths in code — everything through env
  vars, with `.env.*.example` files documenting the shape (see
  `.env.mac-beeper.example` for the Mac side).
- Rollout order: local Mac → local Mac Docker → QNAP test → QNAP production,
  each step gated on explicit approval. **This migration only adds the
  code** — it does not deploy anything to a real Mac or QNAP.

## Known limitations / blockers (not fixed by this migration)

1. **`beeper-oplog` needs a MongoDB replica set.** QNAP's MongoDB currently
   runs standalone (see the replica-set migration doc) — deliberately, after
   a real bootstrap bug was hit and rolled back. `beeper-oplog` cannot run
   until that migration is re-attempted and approved. Until then, live
   updates only flow through `beeper-sync` (manual) and `beeper-ws` (raw
   events only — `beeper-ws` writes to `beeper_events` but does not itself
   normalize into `contacts`/`channels`/`messages`; that normalization is
   `beeper-oplog`'s job). **Practical effect:** without `beeper-oplog`
   running, new incoming messages land in `beeper_events` but are not yet
   reflected in the contact timeline UI until a `beeper-sync` pass picks
   them up (SQLite import) or `beeper-oplog` is deployed.
2. **The dashboard's live-update SSE endpoint (`/api/beeper-crm/events`)
   degrades gracefully but not fully live** on a standalone MongoDB:
   `dba.subscribeToBeeperChanges()` tries `db.watch()` first and falls back
   to a 5s poll-and-ping when change streams aren't available (standalone
   Mongo). The client still refetches correctly either way — the only
   difference is latency (near-instant vs up to 5s).
3. **The media proxy (serving Beeper attachment images/voice notes/etc.) is
   Mac-only and was not ported.** The source project's
   `/api/media/[...mediaId]` reads Beeper's local media cache directory
   (`~/Library/Application Support/BeeperTexts/media/...`), calls Beeper
   Desktop's local REST API, and probes Beeper's local Matrix homeserver
   port via `lsof` — all of which only exist on the Mac running Beeper
   Desktop. Since the dashboard's real runtime is QNAP (no Beeper Desktop),
   this cannot work unmodified. **Not implemented in this pass** — contact
   timelines show attachment metadata (filename/type/size) but not the
   media itself. Fixing this needs a product decision: either (a) have
   `beeper-sync`/`beeper-ws` download and store attachment bytes into Mongo
   or a shared file store reachable from QNAP, or (b) run a small Mac-side
   media sidecar that the QNAP dashboard proxies to over Tailscale. Left as
   a documented gap, not guessed at.
4. **Google Contacts sync** (`beeper-sync/sync-google-contacts.mjs`,
   `mergeSuggestionsCol`/`type: "google_enrich"` suggestions) was migrated
   as-is (it's part of `beeper-sync`'s pipeline) but the dashboard's
   `/api/merge-suggestions` endpoint that *served* Google-enrich suggestions
   from a `merge_suggestions` collection was **not** ported — the source
   README itself lists Google Contacts as a "planned integration", and the
   live merge-suggestions feature actually used by the UI is the fuzzy
   name-matching one (`getBeeperMergeSuggestions`), which **was** fully
   ported. The `merge_suggestions` collection is still migrated by the data
   migration script for completeness, just not read by the new UI.

## Naming

To avoid confusion with the older CP-based "Messages" feature, this feature
uses the `beeper-crm` name everywhere it needs to be distinct: `dba`'s
`beeper-crm.ts` module, `/api/beeper-crm/*` routes. The user-facing sidebar
label is just **"Beeper"**.
