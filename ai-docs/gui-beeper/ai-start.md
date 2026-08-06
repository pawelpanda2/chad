# GUI Beeper — navigation hosts (Story 105)

## Two hosts, one Conversations component

| Host | Route | Tabs |
|------|-------|------|
| **MultiView** (Msg Auto) | `/dashboard/msg-automation/multiview` | Conversations, Permissions, Groups, Msg workout |
| **Beeper** (main nav) | `/dashboard/beeper` | **Conv**, **Settings** |

Both Conversations / Conv tabs render the same shared component:

`packages/dashboard/components/beeper/beeper-conversations-view.tsx`
(`BeeperConversationsView`)

Do not fork fetchers, contact state, split-view, or Msg Workout into a
second copy.

## Legacy URLs

- Old Msg Auto hub label **Beeper** → now **MultiView**.
- `/dashboard/beeper?tab=permissions|groups|msg-workout` redirects to
  MultiView with the same query.
- `/dashboard/beeper?tab=conversations` or bare `/dashboard/beeper` →
  Beeper **Conv**.
- `/dashboard/beeper/[id]` profile/merge routes are unchanged.

## Settings → Plugin synch

See `ai-docs/plugin-beeper-synch/`.
