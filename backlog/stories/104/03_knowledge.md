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
