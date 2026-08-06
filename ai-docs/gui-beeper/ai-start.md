# GUI Beeper — navigation hosts (Story 105/106)

## Two hosts, one Conversations component

| Host | Route | Tabs |
|------|-------|------|
| **MultiView** (Msg Auto hub) | `/dashboard/msg-automation/multiview` | Conversations, Permissions, Groups, Msg workout |
| **Beeper** (Msg Auto hub, next to MultiView) | `/dashboard/beeper` | **Conv**, **Settings** |

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

Closed APIs: `GET/POST /api/beeper/plugin-synch/{status,start}`.

Health-aware statuses (see `ai-docs/plugin-beeper-synch/`):

- Success: `running` (healthy + authorized)
- Errors (top red **ErrorBox**, first above page chrome on Settings):
  `token expired`, `unauthorized`, `sync failed`, `unhealthy`,
  `error no connection to plugin`, `failed`
- `already running` is informational only — never final success without health

Beeper Desktop API key lives in `.env.mac-beeper` (`BEEPER_API_KEY`).
Helper token for Docker ↔ host is separate (`BEEPER_SYNCH_HELPER_TOKEN`).
