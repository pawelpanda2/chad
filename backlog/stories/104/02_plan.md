# Links V2 — Implementation Plan (Story 104)

## Context

CHAD currently has one "Links" feature (Story 90): `packages/dba/src/lead-beeper-links.ts`,
GUI at `/dashboard/msg-automation/links`. It links a lead to Beeper conversations only,
storing the links in the **Beeper Mongo** database (`lead_conversation_links` collection),
matched primarily by phone.

The user wants a **new, parallel** "Links V2" feature that:
- Leaves the old Links module completely untouched.
- Links a lead to **multiple providers** (Beeper conversations, Google Contacts, and future
  providers), not just Beeper.
- Stores the link data as a **Content-Provider Text Item** (`links`, YAML body) inside the
  lead's own folder — explicitly **not** in item config and **not** in the Beeper database.
- Runs both on-demand (a "Synchronize" button) and automatically once a day around 05:00.
- Auto-creates a "Draft Lead" for any Beeper contact that has no matching lead yet, without
  ever creating a duplicate draft.
- Surfaces both kinds of links in Lead Details, and shows Draft Leads on the leads list.

This is a genuinely new module with real architectural decisions (where the code lives, how
matching/dedup works, how the scheduler is gated), so it gets a Story (104) and this plan
before any code is written, per `ai-docs/begin_here/03_story-standard.md`.

## Where the code lives (and why)

Per `documentation/dba/project-goal.md`: **all** raw Content-Provider communication must be
hidden in `dba` — dashboard/console never call CP methods directly. Since Links V2's core
job is writing a Text Item into a lead's cp_item folder and creating new lead Folders (Draft
Leads), that logic **must** live in `dba`, not a standalone package. `packages/google-contacts`
and Beeper's raw client packages stay pure API clients with no CP knowledge — `dba` is the
glue, same as today (`google-contacts-tokens.ts`, `beeper-crm.ts`).

New module: **`packages/dba/src/links-v2/`** (a self-contained subfolder, not reusing/importing
`lead-beeper-links.ts` — Beeper matching re-reads Beeper Mongo directly via the general-purpose
`listBeeperContacts()`/`getBeeperContact()` from `beeper-crm.ts`, so V2 has zero coupling to the
old module and stays independently deletable):

- `types.ts` — `LinkProvider` interface (`id`, `findMatches(ctx) → candidates`), shared types.
- `links-item.ts` — read/write/merge the `links` YAML Text Item under a lead folder, using the
  existing generic `getChildrenOf`/`createOrGetChild`/`putItemBody` from `item-ops.ts` (same
  pattern the `contacts` item already uses) + `js-yaml` for parse/dump (the Date/Daily Entry
  precedent, not the hand-rolled `contacts` parser).
- `beeper-provider.ts` — phone-match a lead against Beeper contacts (`listBeeperContacts()`).
- `google-contacts-provider.ts` — phone-match a lead against the user's Google Contacts
  (`listAllGoogleContacts()` + `google-contacts-tokens.ts` for the access token; skips
  silently, reported not errored, if the user has no Google Contacts connection).
- `draft-leads.ts` — create a Draft Lead (wraps existing `createLead()` + `putItemConfig` to
  set `draft: true` on the lead Folder's config — config is a free-form pass-through field,
  confirmed by the recent Folder `sorting` feature, so this needs no CP/schema change).
- `sync.ts` — orchestrates one full sync pass for the *current* repo context: loads all leads,
  loads Beeper contacts once and Google contacts once (builds in-memory phone indices), matches
  every lead against both, merges+writes changed `links` items only, then creates Draft Leads
  for any Beeper contact left unmatched after all leads are processed. Returns a report
  (`{leadsScanned, newBeeperLinks, newGoogleContactsLinks, draftLeadsCreated, googleContactsSkipped, errors[]}`).
  Used by both the manual button and the scheduler.
- `scheduler.ts` — daily ~05:00 gate. A lightweight tick (every few minutes, same recursive
  `setTimeout` style as `google-sheets/worker.ts`) checks local hour ≥ 5 and a persisted
  `lastRunDate` (stored as a small YAML Text Item under the `chad_admin` repo context, so a
  process restart doesn't cause a same-day re-run). When due, iterates **every** user from
  `getUsersListBody()` (`admin-users.ts`) and runs `sync.ts` inside
  `runWithRepoContext({repoGuid, username}, ...)` per user — this is the exact pattern already
  used by `packages/dba/scripts/reconcile-google-sheets.mjs`. One user's failure is caught and
  logged, never aborts the rest. Gated by a new `LINKS_V2_SYNC_ENABLED` env var (default on),
  wired into `packages/dashboard/instrumentation.ts` next to the existing Google Sheets worker
  startup call.

Small additive change to `packages/google-contacts`: add `getGoogleContactPerson(accessToken,
resourceName)` to `people-client.ts` (single `people.get` call) — not currently exported.
Used only if we later need a live single-contact fetch; **not required** for Lead Details (see
below), kept only if useful for the sync path's per-match freshness. If it turns out unused
after implementation, it will be dropped rather than left as dead code.

## Data model

`links` Text Item, one per lead folder, YAML body:

```yaml
beeper:
  - chatId: "68f2a1c9e4b0..."
    type: whatsapp
    method: automatic
    updatedAt: "2026-08-05T05:00:00.000Z"
googleContacts:
  - resourceName: "people/c1234567890"
    displayName: "Anna Kowalska"
    phone: "+48 600 123 456"
    method: automatic
    updatedAt: "2026-08-05T05:00:00.000Z"
```

- `chatId`/`type` match the user's example exactly. `googleContacts` keeps `resourceName` as
  specified, plus a **denormalized `displayName`/`phone`** captured at match time — this is
  deliberately not "copying the whole contact" (still no address/org/photo/etc.), just enough
  to render Lead Details without a live People API call on every page load (Google Contacts
  has no local cache/index by design — Story 103 — so a live call per lead per view would be
  slow and would break if the user disconnects). `method`/`updatedAt` are bookkeeping for
  idempotent re-sync and the report; harmless additions to the shape the user specified.
- Dedup key: `chatId` for Beeper, `resourceName` for Google Contacts — sync only appends
  entries whose key isn't already present for that lead.
- A lead can have many Beeper entries and many Google Contacts entries (one-to-many both ways,
  per the spec).

## Draft Leads

- Trigger: after a sync pass processes every lead, any Beeper contact (with a phone number)
  whose `chatId` never appeared in **any** lead's `links` item (existing or newly-written, all
  observed while building the phone indices during this same pass) gets a Draft Lead.
- Creation: `createLead(name, contactsYaml)` (existing function, reused as-is) with
  `name = "<YY-MM-DD>_dl_<slugified displayName-or-phone>"` (collision-suffixed if two Beeper
  contacts normalize to the same slug in one run), `contactsYaml` pre-filled with `name`/`phone`
  from the Beeper contact. Then `putItemConfig` sets `draft: true` on the lead Folder. Then its
  own `links` item is written immediately with that one Beeper entry — this is what makes the
  no-duplicate-draft guarantee self-sustaining: the next sync run sees the chatId as already
  linked and won't create a second draft for it.
- Visibility: `getAllLeadsWithContacts()` gains a `draft: boolean` field (read straight off
  `lead.config.draft`, already returned by `getChildrenOf` — no extra CP calls, confirmed).
  `views/page.tsx` (the leads list, currently consuming this exact function/shape) renders a
  small "DRAFT" tag next to the lead name when true.

## API routes (thin, per `05_endpoint-rules.md`)

- `GET /api/msg-automation/links-v2` — current user's leads + their parsed `links` items (for
  the new page's default view, no full scan).
- `POST /api/msg-automation/links-v2/synchronize` — runs `sync.ts` for the current user only,
  returns the report.
- Lead Details: extend the existing `getLeadDetailsWithWorkouts` response (consumed by
  `packages/dashboard/app/api/leads-dashboard/details/route.ts`) with the parsed `links` item;
  Beeper entries get their display name/last channel resolved live via the existing
  `getBeeperContact(chatId)` (cheap single-doc Mongo lookup, no external API) so the YAML only
  needs to store `chatId`/`type`.

## GUI

- Msg Automation hub (`.../msg-automation/page.tsx`): new tile **"LINKS V2"** →
  `/dashboard/msg-automation/links-v2`, next to the existing LINKS tile.
- New page `/dashboard/msg-automation/links-v2`: leads list with their current link counts, a
  **Synchronize** button (calls the POST route) and a report panel after it runs (new/updated
  counts, draft leads created, any per-user errors, Google-Contacts-skipped notice if not
  connected). No automatic full scan on page load — only the stored state, per the spec.
- Lead Details page: two new sections after the existing contacts card —
  - **Beeper**: one row per linked chat — messenger type + a link to
    `/dashboard/beeper?contact=<chatId>` (existing deep-link query param, confirmed in
    `beeper/page.tsx`).
  - **Google Contacts**: one row per linked contact — `displayName`, `phone`, a link to
    `https://contacts.google.com/person/<id>` (resourceName without the `people/` prefix), and
    optionally a link into `/dashboard/msg-automation/google-contacts` as the "details" link.
- Leads list (`views/page.tsx`): small "DRAFT" badge next to `leadName` when `draft === true`.

## Tests (vitest, matching `lead-beeper-links.test.ts` style — pure logic first)

1. `links-item.ts` — merge/dedup logic: multiple chats for one lead, multiple providers for one
   lead, no duplicate entries on repeated merge.
2. `beeper-provider.ts` / `google-contacts-provider.ts` — phone-match logic (pure functions,
   given candidate arrays).
3. `draft-leads.ts` — naming/slug collision handling, dedup-by-chatId logic.
4. `sync.ts` — orchestration with injected fakes for the CP/Mongo/Google calls: multiple chats
   per lead, multiple providers per lead, no duplicate links across two consecutive runs, no
   second draft lead for an already-drafted contact.
5. API route smoke tests for manual Synchronize.
6. A scheduler unit test for the date-gating logic (given a fake "now" and a fake persisted
   `lastRunDate`, does it decide to run or not) — not a real 24h wait.
7. Full local Docker rebuild + smoke test per `ai-docs/deploy/` rules, and the mandatory
   `pnpm test:tables-sync` regression gate (Links V2 touches lead data) before marking done.

## Task breakdown (small tasks, functional ones become the Story Checklist)

1. `links-item.ts` — YAML links Text Item read/write/merge (foundation, no GUI yet).
2. Beeper Provider — phone matching, writes `beeper[]` entries.
3. Google Contacts Provider — phone matching, writes `googleContacts[]` entries.
4. `links-v2` page + Synchronize button + report (manual sync end-to-end).
5. Daily 05:00 scheduler (automatic sync end-to-end).
6. Draft Lead creation + no-duplicate guarantee.
7. Draft Lead visible on the leads list.
8. Lead Details → Beeper section.
9. Lead Details → Google Contacts section.
10. Msg Automation hub tile.

(Package/module scaffolding, docs, and the deploy/Docker/regression work are organizational —
they'll be recorded in `06_others_from_report.md`, not as Checklist rows, per the Story
standard.)

## Verification

- `pnpm --filter dba test` (new links-v2 tests) and `pnpm --filter dashboard test` (route/UI
  smoke) must pass.
- `pnpm test:tables-sync` (mandatory regression gate for anything touching lead data).
- Manual click-through once running locally: Synchronize on a repo with at least one lead with
  a phone-matching Beeper contact and one with a phone-matching Google Contact; confirm the
  `links` item body, Lead Details sections, and a Draft Lead appearing on the leads list for an
  unmatched Beeper contact; re-run Synchronize and confirm no duplicate entries/drafts.
- Local Docker rebuild (`bash-scripts/dashboard/03_local_mac_docker/*`) + smoke test before
  calling the Story done, per section 12 of the request (mandatory Docker rebuild/regression
  check, no shortcuts).
- Old Links V1 page/API get a quick regression click-through to confirm zero behavior change.
