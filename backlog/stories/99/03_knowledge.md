# Story 99 — Knowledge

Pointers discovered while doing this Story, with why they matter here (not
a restatement of `ai-docs/begin_here/`, which already holds project-wide
rules — see `02_plan.md` §0 for the facts pulled from there).

- `packages/dba/src/item-ops.ts` — the one generic CP layer to build on
  (`resolveByNames`, `getItemByAddress`, `getChildrenOf`, `createOrGetChild`,
  `findOrCreateFolderChain`, `putItemBody`, `putItemConfig`,
  `deleteItemByAddress`). `putItemConfig` is the write this Story leans on
  most — config-only, body untouched, exactly what `links.beeper` needs.
  Bypasses `DbaDataRouter`/outbox (documented in its own comment) — same
  convention already accepted by `deleteItemByAddress`, so no new pattern
  introduced.
- `packages/dba/src/cp-model.ts` — `CpItem { _id, config, body }`,
  `CpItemConfig` has `[key: string]: unknown`, so `config.links.beeper` is a
  perfectly normal free-form key, no CP-side schema change needed.
- `packages/dba/src/leads.ts` (2820 lines — grep, don't re-read in full):
  `getLeadMsgWorkoutsByLoca` (line ~1945), `ensureLeadSubItems` (~1998),
  `getLeadDetailsWithWorkouts` (~2080), `getMsgWorkoutForEdit` (~2311),
  `saveMsgWorkout` (~2352), `generateWorkoutName`/`createMsgWorkoutForLead`
  (~816-889). `MsgWorkoutItem { physicalKey, logicalName, loca }` is a
  summary shape only — no `config`/`body` — the analyze pipeline needs the
  full `CpItem` per workout (via `getItemByAddress`/`getItemByLoca` using
  the same `loca`).
- `packages/dba/src/lead-beeper-links.ts` (Story 90) — reused, not
  duplicated: `listLeadBeeperLinks()`, `findLiveBeeperMatchForLead(leadName,
  leadLoca)`, `extractPersonNameFromLeadName` (confirms
  `"26-07-27_pn_Klaudia_delfin"` is exactly the shape this file's own doc
  comment uses as its example — a real lead of the current user's).
  `LeadBeeperLink.conversationId` is a Beeper `contacts._id` (string) — the
  reverse lookup this Story's `conversation-links` route needs
  (conversationId → leadName) isn't provided anywhere yet; write it as a
  simple `.find()` over `listLeadBeeperLinks()`.
- `packages/dba/src/whatsapp-messages.ts` — `stableWhatsAppMessageId` is a
  content hash (`timestamp|sender|rawLine` FNV-1a), not a DB key; confirmed
  via `ai-docs/beeper/mongo-schema.md` that `messages._id` (ObjectId) is the
  only field guaranteed present and unique — the field this Story's
  `links.beeper.messageId` must use. `beeperMessagesToParsedMessages`
  round-trips through `formatBeeperMessagesForExport` (filters
  `text && timestamp`) then `parseWhatsAppMessages` — the filter+order
  correspondence is what lets a `dbId` be zipped back in by index safely.
- `packages/dashboard/components/shared/beeper-conversation-view.tsx` —
  already has `showActions`/`renderMessageAction`/`selectedMessageId` props
  wired for a per-message right-hand action column (built for Message
  Creator's AI-analysis flow) — this Story's marker reuses that prop
  instead of adding new layout. Its `ParsedWhatsAppMessage` is an
  intentionally-duplicated client copy of the dba type (comment says so
  explicitly) — must extend both.
- `packages/dashboard/components/beeper/beeper-conversations-view.tsx` —
  Story 94's split-view; the right-hand `<section>` (lines ~113-141) is
  "the right panel" the spec means by "prawy pasek" — Undated list goes at
  its top, expanded workout replaces `BeeperConversationView` inside the
  same `<section>` (no new route).
- `ai-docs/beeper/ai-start.md` confirms **there is no `ai-docs/gui-beeper/`**
  (Story 94 already hit this and corrected itself) — the prompt's
  `ai-docs/gui-beeper/` references are wrong; link from `ai-docs/beeper/`
  instead.
- Story 90's uncommitted-changes note: `packages/dashboard/app/(dashboard)/
  dashboard/msg-automation/links/page.tsx` and several `dba` files had
  local, uncommitted modifications at the start of this Story from what
  looks like a parallel session (message-creator/audio-recording work) —
  none of those files are touched by this Story; if they still show as
  modified in `git status` at commit time, only this Story's own new/changed
  files are staged (never a blanket `git add -A`).
- Backend: current `chad-postgres` is the live CP backend
  (`ai-docs/databases/red-rules.md`) — LOCAL and TEST/PROD all reach the
  same real Postgres + Beeper Mongo over Tailscale; there is no
  fake/seeded local dataset, so the pilot lead's real data is what gets
  exercised even from a local dev server.
