# Story 104 — Knowledge

Git SHA before this Story: `1e88ba3ed2464330dd01ffe86a1868313a695390`.

## Old Links module (Story 90) — read for contrast, left untouched

- `packages/dba/src/lead-beeper-links.ts` — stores lead↔Beeper-conversation
  links in Beeper Mongo (`beeper_<repoGuid>`, collection
  `lead_conversation_links`), matched by phone. GUI
  `/dashboard/msg-automation/links`, API
  `packages/dashboard/app/api/msg-automation/links/**`.
  `human-docs/dashboard/msg-automation/features/links.md` — feature doc.
- Needed to confirm Links V2 must live at a different route/storage and
  must not import from this file (independence explicitly required by the
  spec — "Nie rozwijaj starego modułu Links").

## Lead / cp_item model

- `packages/dba/src/leads.ts` — `getAllLeadsWithContacts()` (leads list +
  `hasContacts`), `getLeadDetails`/`getLeadDetailsWithWorkouts` (per-lead
  read), `createLead(leadName, contactsYaml?)` (creates the lead Folder +
  `contacts` Text child + `msg workout` Folder child). A lead's contact
  data is **one** `contacts` Text Item (hand-rolled parser, not real YAML),
  not one item per platform — corrected an initial wrong assumption from
  the request's own wording ("W folderze leada istnieją Text Itemy…" reads
  as one-item-per-platform; the real model is one combined item).
- `packages/dba/src/item-ops.ts` — the generic, business-agnostic Item
  layer (`getChildrenOf`, `createOrGetChild`, `putItemBody`,
  `putItemConfig`, `getItemByAddress`, `findOrCreateFolderChain`) every
  `dba` write goes through. `links-item.ts`/`draft-leads.ts` build on this
  directly, same pattern the `contacts` item uses.
- `packages/dba/src/cp-model.ts` — `CpItem`/`CpItemConfig` shapes;
  `config` is a free-form pass-through record (only `id`/`address`/`type`/
  `name` are CP-enforced) — confirmed by the recent Folder `Config.sorting`
  feature (`235b3e6`), which is why `draft: true` on a lead's Folder config
  needed no schema change.
- `documentation/dba/post-parent-item.md` (find-or-create pattern) —
  underlying model for `createOrGetChild`.

## Beeper

- `ai-docs/beeper/architecture.md`, `ai-docs/beeper/mongo-schema.md` — per-
  user Mongo db `beeper_<repoGuid>`, `contacts` collection schema
  (`phones: {number,label}[]`, `identities: {network,senderID}[]`).
- `packages/dba/src/beeper-crm.ts` — general Beeper CRM read functions
  (`listBeeperContacts`, `getBeeperContact`) — Links V2's
  `beeper-provider.ts` reads the raw `contacts` collection directly
  (mirroring `lead-beeper-links.ts`'s own query, but as independent code)
  rather than importing anything from the old Links module.
- `packages/dashboard/app/(dashboard)/dashboard/beeper/page.tsx` —
  `?contact=<id>` query param is the existing deep-link into a
  conversation; reused for the Lead Details "Open conversation" link.

## Google Contacts (Story 103)

- `ai-docs/google-contacts/ai-start.md` — package boundaries: per-user
  OAuth (`contacts.readonly`), refresh token encrypted in
  `integrations/google-contacts/oauth-tokens`
  (`packages/dba/src/google-contacts-tokens.ts`).
- `packages/google-contacts/src/*` — `GoogleContactDto` (`resourceName`,
  `displayName`, `phones: string[]`, ...), `listAllGoogleContacts`,
  `refreshGoogleContactsAccessToken`, `requireGoogleContactsConfig`. No
  phone-search endpoint — callers list-all and filter locally (same
  approach Links V2's provider uses).
- `packages/dashboard/app/api/google-contacts/list/route.ts` — the
  token-refresh-then-list flow Links V2's provider follows.

## Scheduler / background-job precedent

- No existing "run once daily at a fixed time" job anywhere in the repo.
  `packages/dba/src/google-sheets/worker.ts`/`bootstrap.ts` — the
  `setTimeout`-recursive-loop-inside-the-Dashboard-process pattern (no
  separate container), started from `packages/dashboard/instrumentation.ts`
  — reused for `links-v2/scheduler.ts`, but the daily/date-gating logic
  itself is new (`isDailySyncDue`).
- `packages/dba/src/admin-users.ts` — `getUsersListBody()` /
  `CHAD_ADMIN_REPO_GUID`, the canonical way to enumerate every CHAD user
  outside of a request context.
- `packages/dba/scripts/reconcile-google-sheets.mjs` — the exact
  `runWithRepoContext({repoGuid, username}, ...)` looped-over-every-user
  pattern the scheduler's `runForAllUsers()` follows.

## GUI redesign phase (mockup-driven, Task 11)

- Base commit for this phase: `81207b7` — checkpoint of the pre-existing
  Task 1–10 backend + first-pass GUI (found uncommitted at the start of
  this phase, matching the checklist's already-DONE tasks exactly;
  committed as-is before any redesign edits, per the mandatory
  return-point rule).
- `examples/` had 9 mockup files; `CHAD_links_v2_redesign_mockup_v10.html`
  was the only one both named for Links V2 and the newest by mtime
  (2026-08-06, vs. `..._v5.html` from 2026-07-26) — no ambiguity to
  resolve.
- The mockup's own inline `<script>` (vanilla JS, direct
  `style.gridTemplateColumns` mutation on drag, `dataTransfer` for DnD
  payloads) was read as the literal interaction spec, not just the CSS —
  `_lib/resize.ts` and `page.tsx`'s drag handlers are a direct React port
  of that logic (min/centerMin clamp formulas included), not a
  reinterpretation.
- No existing drag-and-drop pattern anywhere else in `packages/dashboard`
  (confirmed by grep before starting) — this is the first HTML5 native
  DnD usage in the codebase. Kept deliberately plain (native `draggable`/
  `dataTransfer`, no library) rather than introducing a new dependency
  for one page.
- Full research pass on reusable pieces before writing GUI code (see
  `06_others_from_report.md` for the source agent's findings): confirmed
  `listBeeperContacts`/`getBeeperContact` (`beeper-crm.ts`) as the
  full-list/single-conversation reads (distinct from `beeper.ts`'s older
  lead-scoped walker), `BeeperPlatformIcon` as the one icon component to
  reuse, and the Google Contacts page's inline avatar-circle pattern
  (no shared `Avatar` component exists) as the visual to copy.

## Story-standard / GUI conventions

- `ai-docs/begin_here/03_story-standard.md`, `05_endpoint-rules.md` — this
  file's own structure, and the thin-API/logic-in-dba rule every new route
  here follows.
- `packages/dashboard/app/(dashboard)/dashboard/msg-automation/google-contacts/page.tsx`
  — the closest existing single-page pattern (status/list/action buttons,
  `DashboardPageShell`, `layout-tokens`) the new Links V2 page's structure
  follows.
- `packages/dashboard/app/(dashboard)/dashboard/views/page.tsx` — the
  actual leads-list page (despite `documentation/`'s stale path
  references, the real directory is `human-docs/`, not `documentation/` —
  pre-existing repo-wide inconsistency, out of scope to fix here).
