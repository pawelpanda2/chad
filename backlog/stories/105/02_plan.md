# Story 105 — Plan

1. Start SHA: `52fbd39` (leave unrelated WIP untouched).
2. Move current `/dashboard/beeper` multi-tab UI → `/dashboard/msg-automation/multiview`.
3. New `/dashboard/beeper` = Conv + Settings; redirect legacy tabs to MultiView.
4. Shared `BeeperConversationsView` only.
5. Loopback helper + closed `/api/beeper/plugin-synch/{status,start}`.
6. Docs, tests, local Docker, commit+push; PROD NOT RUN.
