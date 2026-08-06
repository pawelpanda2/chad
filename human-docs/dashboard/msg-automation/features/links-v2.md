# Msg Auto → Links V2

Story 104. Route: `/dashboard/msg-automation/links-v2`. Independent of, and
leaves untouched, the old Links module (`links.md`, Story 90) — different
storage, different matching model, different GUI.

## Model

Links live on the lead itself: a `links` Text Item inside the lead's own
cp_item folder (`leads/all items/<leadName>/links`), YAML body:

```yaml
beeper:
  - chatId: "68f2a1c9e4b0..."
    type: whatsapp
    method: automatic
    matchedOn: phone
    updatedAt: "2026-08-05T05:00:00.000Z"
googleContacts:
  - resourceName: "people/c1234567890"
    displayName: "Anna Kowalska"
    phone: "+48 600 123 456"
    method: automatic
    matchedOn: phone
    updatedAt: "2026-08-05T05:00:00.000Z"
```

Never stored in item config, never in the Beeper database (both explicitly
disallowed by the spec — the old module's `lead_conversation_links` Mongo
collection is a different, untouched thing). A lead can hold many entries
per provider. `googleContacts.displayName`/`.phone` are denormalized at
match time (not a live People API call per Lead Details view) — still not
"copying the whole contact", see `ai-docs/google-contacts/ai-start.md`.

## Package

`packages/dba/src/links-v2/` — `Lead → Link Provider → Beeper Provider →
Google Contacts Provider → future providers`, per the spec:

- `types.ts` — `LinkProvider<TIndex, TEntry>` interface (`buildIndex()` once
  per sync pass, pure `findMatchesForLead()` after).
- `links-item.ts` — read/write/merge the `links` item (`js-yaml`, first item
  in the codebase to use real YAML load/dump on both sides — the `contacts`
  item uses a hand-rolled parser instead).
- `beeper-provider.ts` — phone-matches against the per-user Beeper Mongo
  `contacts` collection, read directly (not via the old Links module).
- `google-contacts-provider.ts` — phone-matches against
  `listAllGoogleContacts()` using the existing per-user OAuth token
  (`google-contacts-tokens.ts`, Story 103); skips silently (reported, never
  thrown) when not connected.
- `draft-leads.ts` — creates a Draft Lead (`createLead()` + `config.draft =
  true` on the Folder) for an unmatched Beeper contact.
- `sync.ts` — orchestrates one pass for the current repo context.
- `scheduler.ts` — daily ~05:00 gate, iterates every user.
- `page-data.ts` — read-only GUI data (no matching triggered on page load).

## Beeper matching

Phone first (exact digits, else last-9-digits), independent of the old
Links module's own copy of the same heuristic. `chatId` appended to
`links.beeper`. One lead ↔ many chats.

## Google Contacts matching

Phone only. `resourceName` (+ denormalized `displayName`/`phone`) appended
to `links.googleContacts`. Never copies the full contact.

## Draft Leads

Any Beeper contact (with a phone) unmatched by every lead after a sync pass
gets a Draft Lead: `createLead()` with a pre-filled `contacts` item, name
`<YY-MM-DD>_dl_<slug>`, `config.draft = true`. Its own `links` item is
written immediately, pointing at that chat — this is what prevents a
second draft for the same contact on the next run (the contact reads as
"already matched" from then on). Visible on the leads list
(`views/page.tsx`) via a `Draft` badge, driven by `LeadDashboardItem.draft`
(`getAllLeadsWithContacts()`, free — read off the already-fetched Folder
config, no extra CP call).

## Synchronize

`POST /api/msg-automation/links-v2/synchronize` — runs one pass for the
current user, returns a report (`leadsScanned`, `newBeeperLinks`,
`newGoogleContactsLinks`, `draftLeadsCreated`, `googleContactsConnected`,
`errors`). The Links V2 page never scans on load — only `GET
/api/msg-automation/links-v2` (already-stored `links` items).

## Daily scheduler

`startLinksV2DailySchedulerIfEnabled()`, started from
`packages/dashboard/instrumentation.ts` (same process-placement pattern as
the Google Sheets worker — no separate container). Every few minutes,
checks local hour ≥ 5 and a `lastRunDate` persisted under the `chad_admin`
repo (`links-v2/scheduler-state`); when due, loops every user from
`getUsersListBody()` and runs the same `syncLinksV2ForCurrentRepo()` inside
`runWithRepoContext(...)` per user — one user's failure never blocks the
rest. `LINKS_V2_SYNC_ENABLED=false` disables it.

## GUI

- Msg Automation hub — `LINKS V2` tile, next to the old `LINKS` tile.
- Lead Details — `Beeper` section (type + link to
  `/dashboard/beeper?contact=<chatId>`) and `Google Contacts` section
  (name, phone, link to `contacts.google.com/person/<id>`, optional link to
  the Google Contacts page), both read straight off
  `getLeadDetailsWithWorkouts()`'s new `links` field.
- Leads list — `Draft` badge.

## Isolation

`getCurrentUserFromCookies` + `runWithRepoContext` on every route, same as
every other `dba` integration; the scheduler resolves its own per-user
context from `admin-users.ts`, never from a request.

## Tests

`packages/dba/src/links-v2/*.test.ts` (vitest) — YAML parse/dump/merge,
phone matching per provider, Draft Lead naming/collision, sync
orchestration (mocked CP/Mongo/providers — multiple chats per lead,
multiple providers per lead, no duplicates across re-runs, no second
Draft Lead), and the scheduler's date-gating decision.

## GUI redesign (per `examples/CHAD_links_v2_redesign_mockup_v10.html`)

The page is a single client component
(`app/(dashboard)/dashboard/msg-automation/links-v2/page.tsx`) with three
main tabs:

- **Leads** — `left: leads (search + linked-Beeper count) | center:
  Links/Conv inner tabs for the selected lead | right: full Beeper
  conversation list`. Drag a conversation from the right onto the center
  list to assign; drag an already-linked entry onto the compact `REMOVE`
  box to unlink (confirmed). Clicking a conversation (either side) opens
  the `Conv` inner tab (hidden until first use) with that conversation's
  messages, and cross-highlights the same chat in the other panel.
- **Conv** — `left: Beeper conversations (assigned lead name + red ✕, or
  nothing) | right: leads` — no center panel. Drag a lead onto a
  conversation to assign (confirmed "Replace linked lead?" if it already
  has a different one); click the red ✕ for a "Unlink lead from this
  conversation? Yes/No" confirm.
- **Google** — `left: leads (search + linked-Google-Contacts count) |
  center: that lead's linked Google Contacts, no search, drag-to-assign
  from the right, drag-to-`REMOVE`` to unlink | right: full Google
  Contacts list (search)`.

Panels are resized by dragging the thin grip between them
(`_lib/resize.ts` — mutates `gridTemplateColumns` directly during drag,
no React re-render per pixel). Side panels floor at 200px; the center
panel floors at 100px (Leads/Google) or 200px (Conv, both sides).

Reuses existing endpoints read-only: `GET /api/beeper-crm/contacts` (full
Beeper list), `GET /api/beeper-crm/contacts/[id]` (single conversation's
messages), `GET /api/google-contacts/list` (full Google Contacts list),
and this Story's own `GET /api/msg-automation/links-v2` (every lead's
already-stored `links`). The `BeeperPlatformIcon` component
(`components/beeper/beeper-platform-icon.tsx`) is reused for the
WhatsApp/Instagram marks — no new icon set.

### Manual link/unlink (drag & drop, REMOVE, unlink-✕)

The automatic sync pass (`sync.ts`) only ever *adds* matches; the redesign
needed direct single-entry assign/unlink, driven by an explicit GUI
action rather than a phone match. `packages/dba/src/links-v2/manual-links.ts`:

- `linkBeeperConversationToLead({ leadLoca, chatId, network })`
- `unlinkBeeperConversationFromLead({ leadLoca, chatId })`
- `linkGoogleContactToLead({ leadLoca, resourceName, displayName, phone })`
- `unlinkGoogleContactFromLead({ leadLoca, resourceName })`

Built on the same `readLeadLinks`/`writeLeadLinks`/`mergeBeeperEntries`/
`mergeGoogleContactsEntries` primitives the automatic path already uses —
no new storage model. Entries written this way get `method: "manual"`
and `matchedOn: "manual"` (the `matchedOn` field was widened from the
literal `"phone"` to `"phone" | "manual"` in `types.ts`/`links-item.ts`
to record this). Four thin route adapters:
`POST /api/msg-automation/links-v2/{beeper-link,beeper-unlink,google-link,google-unlink}`.

**One-conversation-one-lead is enforced client-side, not in storage.**
`manual-links.ts` itself will happily write the same `chatId` into two
different leads' `links` items if asked (see its own test) — the spec's
"a conversation has at most one lead" rule is a GUI-level contract:
`page.tsx`'s `assignBeeperToLead` reads the already-loaded page data to
find any existing owner and shows a "Replace linked lead?" confirm before
unlinking the old owner and linking the new one. No equivalent rule
exists for Google Contacts (the spec only stated it for Beeper
conversations).

**Tests:** `packages/dba/src/links-v2/manual-links.test.ts` (10 tests).

### Beeper contact-group filter (Leads/Conv tabs)

The Leads tab's right panel and the Conv tab's left panel both list the
full set of Beeper conversations — the same reusable `BeeperGroupFilter`
combobox from the Beeper page (`components/beeper/beeper-group-filter.tsx`,
Story 101) is placed above the search field in both, filtering that list
client-side by `groupId` (contacts already carry `groupId` in the payload
from `GET /api/beeper-crm/contacts`, unchanged endpoint). Defaults to the
user's default group (`GET /api/beeper-crm/groups/default`, same one-time-
on-mount pattern as the Beeper page) instead of "All groups" — a single
shared filter state (`beeperGroupFilter` in `page.tsx`) applies to both
tabs since they show the same underlying Beeper contact list, just in
different layouts.

