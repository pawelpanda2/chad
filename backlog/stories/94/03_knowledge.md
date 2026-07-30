# Story 94 — Knowledge

- `packages/dashboard/app/(dashboard)/dashboard/beeper/page.tsx` — current
  Permissions/All tabs, `listBeeperContacts()` via `/api/beeper-crm/contacts`.
  The "All" list currently uses `next/link` to `/dashboard/beeper/[id]` per
  row — this is exactly the navigation behavior the new Conversations tab
  must NOT do.
- `packages/dashboard/app/(dashboard)/dashboard/beeper/[id]/page.tsx` — full
  contact detail page (profile edit, tags, merge, timeline). Not reused
  directly; it has its own bespoke inline bubble rendering (does NOT use
  `BeeperConversationView`) — this Story's split-view uses the shared
  renderer instead, per the prompt's requirement.
- `packages/dashboard/components/shared/beeper-conversation-view.tsx` — the
  shared renderer. Accepts either `content` (raw WhatsApp-export text,
  parsed client-side) or pre-parsed `messages` (preferred — "stable IDs from
  bootstrap / DBA", per its own doc comment). When `messages.length === 0` it
  renders its own icon+text empty state — must be avoided for this Story
  (see 02_plan.md).
- `packages/dba/src/message-creator.ts` — `formatBeeperMessagesAsExport()` +
  `formatTimestampForExport()` (private) is the existing, proven adapter
  from live Beeper CRM messages (`{isSelf, text, timestamp}`) to the
  WhatsApp-export text format `parseWhatsAppMessages()` expects. Used by
  `getLeadConversationForCreator()` for Message Creator's live-Beeper path
  (Story 92 follow-up, wired end-to-end in the commit right before this
  Story: `85a03d4 feat(msg-auto): wire Message Creator to live Beeper CRM
  conversations`). Moved to `whatsapp-messages.ts` in this Story so
  `beeper-crm`'s own detail route can reuse it without a layering violation
  (`beeper-crm.ts` must not import from `message-creator.ts`, which already
  depends on `beeper-crm.ts`).
- `packages/dba/src/whatsapp-messages.ts` — the actual parser
  (`parseWhatsAppMessages`), stable ID hashing, already re-exported through
  `message-creator.ts` → `dba` package root (`export * from
  './message-creator.js'` in `packages/dba/src/index.ts`).
- `packages/dashboard/app/api/beeper-crm/contacts/[id]/route.ts` — thin
  route wrapping `getBeeperContact()`, already scoped via
  `runWithRepoContext(user, ...)`. Extending its JSON with one more
  field is backward compatible (05_endpoint-rules.md §5) — no consumer of
  this route reads its exact shape defensively enough to break from an
  added field (`[id]/page.tsx` destructures the fields it needs, ignores
  the rest).
- `packages/dashboard/app/(dashboard)/dashboard/messages/page.tsx` — the
  named layout pattern to draw from (not copy): `DashboardPageShell
  scroll={false}`, `grid h-full min-h-0 gap-3 lg:grid-cols-3`, two `Card`s,
  each with its own internal `overflow-y-auto`. This Story intentionally
  does NOT use `lg:grid-cols-3` (prompt explicitly says avoid a rigid grid
  that blocks collapse) — uses `flex` instead so the aside can animate to
  `w-0`.
- No `ai-docs/gui-beeper/` directory exists (prompt assumed one); actual
  Beeper doc index is `ai-docs/beeper/ai-start.md`.
- Beeper isn't one of the 4 fixed test pillars
  (`ai-docs/tests/ai-start.md`) — its tests are co-located with source
  (`packages/dba/src/*.test.ts`, `packages/dashboard/components/**/*.test.ts`),
  consistent with `ai-prompt-kind.ts`/`.test.ts`.
