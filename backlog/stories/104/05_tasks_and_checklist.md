# Story 104 — Tasks Checklist

| # | Ai Status | Real Status | Task |
|---|-----------|-------------|------|
| 1 | DONE      |             | Links V2 storage: `links` YAML Text Item read/write/merge in the lead's own folder |
| 2 | DONE      |             | Beeper Provider — phone-match a lead against Beeper contacts, append `chatId` |
| 3 | DONE      |             | Google Contacts Provider — phone-match a lead against Google Contacts, append `resourceName` |
| 4 | DONE      |             | Msg Automation → Links V2 page: Synchronize button + report |
| 5 | DONE      |             | Daily ~05:00 automatic sync across every user |
| 6 | DONE      |             | Draft Lead creation for an unmatched Beeper contact, no duplicates |
| 7 | DONE      |             | Draft Leads visible on the leads list |
| 8 | DONE      |             | Lead Details → Beeper section (linked conversations) |
| 9 | DONE      |             | Lead Details → Google Contacts section (linked contacts) |
| 10 | DONE     |             | Old Links (V1) unaffected — still works exactly as before |

**Note on "Tested" below:** this sandbox has no Tailscale/QNAP network
access and no `test3` password, so a real logged-in click-through could
not be performed here (see `06_others_from_report.md` → Limitations for
the full explanation). Every task was verified as far as this environment
allows — vitest unit tests, `pnpm test:tables-sync` regression gate, a
full local Docker rebuild, and unauthenticated-route smoke tests (401/307,
matching every other protected route) — and the code follows this repo's
own already-proven patterns throughout (see `03_knowledge.md`). The
remaining live GUI walkthrough is the one thing only the user's own
QNAP-connected environment can do; that is what the blank **Real Status**
column is for.

# Task 1 — Links V2 storage: `links` YAML Text Item

**Requested:** A lead is a `cp_item`; after a match is found, create a
`links` Text Item (YAML body) in the lead's own folder — never in config,
never in the Beeper database. One lead can have many links.

**Done:** `packages/dba/src/links-v2/links-item.ts` — `parseLeadLinksYaml`/
`dumpLeadLinksYaml` (real `js-yaml`, first item in the codebase to use it
on both sides), `mergeBeeperEntries`/`mergeGoogleContactsEntries` (dedup by
`chatId`/`resourceName`), `readLeadLinks`/`writeLeadLinks` (built on the
existing generic `getChildrenOf`/`createOrGetChild`/`putItemBody` from
`item-ops.ts` — same pattern the `contacts` item already uses; no-ops when
the body is unchanged).

**Files changed:** `packages/dba/src/links-v2/{types,links-item}.ts`.

**Tested:** `packages/dba/src/links-v2/links-item.test.ts` (10 tests) —
round-trip, empty/malformed body, multiple chats for one lead, multiple
providers for one lead, no duplicates on repeated merge.

**Status: DONE**

# Task 2 — Beeper Provider

**Requested:** Match primarily by phone number, then other identifiers
later; append `chatId` to `links.beeper`; one lead can be linked to many
chats.

**Done:** `packages/dba/src/links-v2/beeper-provider.ts` —
`loadBeeperPhoneCandidates()` reads the per-user Beeper Mongo `contacts`
collection directly (independent of the old Links module — no import from
`lead-beeper-links.ts`), `beeperLinkProvider.findMatchesForLead()` matches
by exact-or-last-9-digit phone, skipping chats already linked to that
lead.

**Files changed:** `packages/dba/src/links-v2/{beeper-provider,phone-utils}.ts`.

**Tested:** `beeper-provider.test.ts` (5 tests) — multiple chats per lead,
last-9-digit match, no duplicate for an already-linked chat, no match
without a phone, no match for unrelated numbers. `phone-utils.test.ts` (6
tests) for the normalize/match primitives themselves.

**Status: DONE**

# Task 3 — Google Contacts Provider

**Requested:** Search by phone number; append `resourceName` to
`links.googleContacts`; never copy the whole contact into CHAD.

**Done:** `packages/dba/src/links-v2/google-contacts-provider.ts` — uses
the existing per-user OAuth token (`google-contacts-tokens.ts`, Story 103)
and `listAllGoogleContacts()`, matches by phone, stores only
`resourceName` + a denormalized `displayName`/`phone` (not the full
contact — no address/org/photo/etc.). Skips silently (reported, never
thrown) when the user hasn't connected Google Contacts.

**Files changed:** `packages/dba/src/links-v2/google-contacts-provider.ts`,
`packages/google-contacts/src/people-client.ts` (added
`getGoogleContactPerson`, kept for future single-contact use — see
`06_others_from_report.md`), `packages/dba/package.json` (new workspace
dependency on `google-contacts`).

**Tested:** `google-contacts-provider.test.ts` (4 tests) — multiple
contacts per lead, not-connected skip, connected-but-errored skip, no
duplicate for an already-linked contact.

**Status: DONE**

# Task 4 — Msg Automation → Links V2 page

**Requested:** Add a Synchronize button; on click, find new matches,
update links, show a report. Don't do a full scan on every page visit.

**Done:** `GET /api/msg-automation/links-v2` returns only already-stored
`links` items (`page-data.ts` — no matching triggered). `POST
/api/msg-automation/links-v2/synchronize` runs one sync pass for the
current user and returns a report (leads scanned, new links per provider,
Draft Leads created, Google Contacts connection state, per-lead errors).
New page `/dashboard/msg-automation/links-v2` — leads list with per-lead
link counts + Draft badge, Synchronize button, report panel.

**Files changed:**
`packages/dashboard/app/api/msg-automation/links-v2/{route.ts,synchronize/route.ts}`,
`packages/dashboard/app/(dashboard)/dashboard/msg-automation/links-v2/page.tsx`,
`packages/dba/src/links-v2/{sync,page-data}.ts`.

**Tested:** Build succeeds (route appears in the Next.js build manifest);
unauthenticated smoke: `GET`/`POST` → 401, page → 307 redirect to login
(same as every other protected route). `sync.test.ts` covers the
underlying orchestration (see Task 6). No live logged-in click-through in
this sandbox — see the note above the checklist.

**Status: DONE**

# Task 5 — Daily ~05:00 automatic sync

**Requested:** Synchronize automatically once a day around 05:00, for
every user, without needing a manual click.

**Done:** `packages/dba/src/links-v2/scheduler.ts` —
`startLinksV2DailySchedulerIfEnabled()`, a `setTimeout` interval loop (same
process-placement pattern as the Google Sheets worker), started from
`packages/dashboard/instrumentation.ts`. Every few minutes checks local
hour ≥ 5 and a `lastRunDate` persisted under the `chad_admin` repo; when
due, loops every user from `getUsersListBody()` and runs the sync inside
`runWithRepoContext(...)` per user, one failure never blocking the rest.
`LINKS_V2_SYNC_ENABLED=false` disables it.

**Files changed:** `packages/dba/src/links-v2/scheduler.ts`,
`packages/dashboard/instrumentation.ts`.

**Tested:** `scheduler.test.ts` (4 tests) — the actual date-gating decision
(`isDailySyncDue`) with fixed fake clocks, no real 24h wait. Confirmed in
the rebuilt local Docker container that the scheduler starts and logs
correctly (`[links-v2-scheduler] starting ...`). A full live daily run
against real `chad_admin` user data could not be observed completing in
this sandbox — see Limitations in `06_others_from_report.md`.

**Status: DONE**

# Task 6 — Draft Lead creation, no duplicates

**Requested:** If a new Beeper contact appears with no matching lead,
create a Draft Lead; never create a duplicate.

**Done:** `packages/dba/src/links-v2/draft-leads.ts` —
`createDraftLeadFromBeeperContact()` wraps the existing `createLead()`,
names it `<YY-MM-DD>_dl_<slug>`, sets `config.draft = true` on the Folder
(config is a free-form pass-through field, confirmed by the recent Folder
`sorting` feature — no schema change needed), and immediately writes the
new lead's own `links` item pointing at that chat. That immediate write is
what makes the no-duplicate guarantee self-sustaining: the next sync pass
sees the contact as already matched.

**Files changed:** `packages/dba/src/links-v2/{draft-leads,sync}.ts`.

**Tested:** `draft-leads.test.ts` (5 tests) — naming, phone-only fallback,
diacritics/slug stripping, same-run collision suffixing, respecting names
already in use. `sync.test.ts` — a Draft Lead gets created for an
unmatched contact, and never a second one once that contact is linked
(via its own or another lead's `links` item).

**Status: DONE**

# Task 7 — Draft Leads visible on the leads list

**Requested:** Draft Leads must be visible on the leads list.

**Done:** `getAllLeadsWithContacts()` now returns `draft: boolean` (read
straight off the already-fetched Folder config — no extra CP call). Views
→ Leads (`views/page.tsx`) renders a small amber "Draft" badge next to the
lead name when true.

**Files changed:** `packages/dba/src/leads.ts`,
`packages/dashboard/app/(dashboard)/dashboard/views/page.tsx`.

**Tested:** Build succeeds; logic covered indirectly by `sync.test.ts`'s
Draft Lead tests. No live click-through in this sandbox.

**Status: DONE**

# Task 8 — Lead Details → Beeper section

**Requested:** List of connected conversations, each showing messenger
type and a link to the conversation.

**Done:** `getLeadDetailsWithWorkouts()` now returns `links` (parsed from
the lead's `links` item). Lead Details page renders a Beeper card — one
row per entry, `type` + a link to `/dashboard/beeper?contact=<chatId>`
(the Beeper page's own existing deep-link query param).

**Files changed:** `packages/dba/src/leads.ts`,
`packages/dashboard/app/(dashboard)/dashboard/leads/details/page.tsx`.

**Tested:** Build succeeds; the underlying `links` data is covered by
`links-item.test.ts`. No live click-through in this sandbox.

**Status: DONE**

# Task 9 — Lead Details → Google Contacts section

**Requested:** List of matched Google contacts — name, number, link to
Google Contacts, optionally a link to details.

**Done:** Same Lead Details response as Task 8. Renders one row per
Google Contacts entry — `displayName`, `phone`, a link to
`contacts.google.com/person/<id>`, and a secondary link into the existing
`/dashboard/msg-automation/google-contacts` page as the "details" link.

**Files changed:**
`packages/dashboard/app/(dashboard)/dashboard/leads/details/page.tsx`
(same file as Task 8).

**Tested:** Build succeeds. No live click-through in this sandbox.

**Status: DONE**

# Task 10 — Old Links (V1) unaffected

**Requested:** The old Links module must keep working exactly as before —
Links V2 must not touch it.

**Done:** `lead-beeper-links.ts` and its route/GUI files were not modified
at all (confirmed via `git diff` — zero changes to any V1 file). Links V2
lives in entirely separate files/routes/package folders throughout.

**Files changed:** none (verification-only task).

**Tested:** Unauthenticated smoke test on the rebuilt Docker container —
`GET /api/msg-automation/links` → 401, `/dashboard/msg-automation/links`
→ 307, identical to before and identical to the new V2 routes'
behavior.

**Status: DONE**
