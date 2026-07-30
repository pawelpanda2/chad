# Story 94 — Plan

## Goal

`/dashboard/beeper`: rename tab "All" → "Conversations", rebuild that tab as
a two-pane split view (contact list | thin separator+handle | conversation),
collapsible list, no navigation to `/dashboard/beeper/[id]` as the primary
interaction. Permissions tab stays functionally unchanged.

## Data flow decision

- Left panel (contact list): reuse existing `GET /api/beeper-crm/contacts`
  (no `view` param = default list), already returns `BeeperContactListItem[]`
  with `displayName`/`lastMessage`/`hasAvatar` — no changes needed.
- Right panel (conversation): reuse existing `GET /api/beeper-crm/contacts/[id]`
  (`getBeeperContact`, already returns `BeeperContactFullDetail.messages`).
  Extend the route's JSON with one new field, `conversationMessages:
  ParsedWhatsAppMessage[]`, computed in `dba` (not the route) via a new
  `beeperMessagesToParsedMessages()` helper in `whatsapp-messages.ts` —
  reuses the existing `parseWhatsAppMessages()` parser instead of duplicating
  it (same format+parse round-trip already proven by
  `message-creator.ts#formatBeeperMessagesAsExport` for the live-Beeper →
  Message Creator wiring). `message-creator.ts`'s private formatter is moved
  into `whatsapp-messages.ts` (pure relocation, both call sites keep working)
  so there is exactly one implementation.
- No new endpoint needed — this satisfies "rozszerz istniejący endpoint" from
  the prompt (adding a field is backward compatible per
  `ai-docs/begin_here/05_endpoint-rules.md` §5).

## Components (packages/dashboard/components/beeper/)

- `beeper-conversations-logic.ts` — pure functions (contact filtering, split
  handle icon/aria-label, whether to show the conversation panel). Unit
  tested directly (project convention: pure logic file + co-located
  `.test.ts`, see `ai-prompt-kind.ts`/`.test.ts`).
- `beeper-permissions-view.tsx` — extracted 1:1 from current inline
  Permissions rendering in `beeper/page.tsx` (no behavior change).
- `beeper-conversation-list.tsx` — left panel: compact search + scrollable
  list of contact rows (button, not Link — no navigation).
- `beeper-split-handle.tsx` — small centered button between panels.
- `beeper-conversations-view.tsx` — container: fetch contacts, fetch
  conversation on selection, collapse state, renders list/handle/panel.

## page.tsx changes

- `ViewTab` "all" → "conversations", label "All" → "Conversations".
- `scroll={view === "permissions"}` on `DashboardPageShell` (conversations
  view manages its own internal scroll per panel, same pattern as
  `messages/page.tsx`).
- Permission-filter select + search input + count span stay conditional on
  `view === "permissions"` only (already were, minus the count/search which
  currently show unconditionally — must become permissions-only, since the
  ban list forbids a contact count in the Conversations panel header and
  1.4 forbids a search box outside the left panel).

## Empty-state handling (hard requirement)

`BeeperConversationView`'s own built-in empty state (icon + "No conversation
found" text) is exactly the banned "empty state icon" — do NOT let it render
for this view. The conversations container only mounts
`<BeeperConversationView />` when `selectedContactId` is set AND
`conversationMessages.length > 0`; otherwise renders a bare `<div
className="h-full" />`. Loading state: a small centered spinner, no text.

## Responsive (mobile)

CSS-only, no viewport JS:
- Aside: `hidden md:flex` when a contact is selected (mobile hides list once
  a contact is open), otherwise flex; width `w-full md:w-[300px]`
  (`w-0` when collapsed, desktop-only concept).
- Conversation section: `hidden md:block` until a contact is selected, then
  visible full-width on mobile too.
- Mobile back affordance: the same `BeeperSplitHandle` rendered a second
  time, `md:hidden`, wired to `setSelectedContactId(null)` instead of the
  collapse toggle — small, no header, consistent visual language.

## Testing

- `packages/dba/src/whatsapp-messages.test.ts` — add cases for
  `beeperMessagesToParsedMessages`.
- `packages/dashboard/components/beeper/beeper-conversations-logic.test.ts` —
  new, registered in `vitest.config.mjs`.
- Manual: `pnpm --filter dba typecheck && pnpm --filter dba build`, `npx tsc
  --noEmit -p packages/dashboard/tsconfig.json`, `pnpm --filter dashboard
  build`, then local Docker + browser smoke test, then TEST deploy + browser
  smoke test. PROD stays NOT RUN.
