# Story 105 — Tasks / checklist

## Start
- [x] Start SHA: `52fbd39a20a2e6379cc9cbd0f330b05f349dd617`
- [x] Parallel WIP left untouched

## Nav / shared UI
- [x] Msg Auto Beeper → MultiView (`/dashboard/msg-automation/multiview`)
- [x] Main nav Beeper (`/dashboard/beeper`) with Conv + Settings
- [x] Shared `BeeperConversationsView`
- [x] Legacy tab redirect to MultiView

## Plugin synch
- [x] Loopback/host helper `bash-scripts/beeper-synch/local-helper.mjs`
- [x] Closed API `/api/beeper/plugin-synch/{status,start}`
- [x] Settings button `Plugin synch`
- [x] TEST/PROD → `error no connection to plugin`

## Verify
- [x] Unit tests PASS (plugin-synch + routing + conversations-logic)
- [x] Typecheck PASS
- [x] Local Docker rebuild (`06_deploy.sh`)
- [x] Browser smoke (MultiView, Conv/Settings, Plugin synch)
- [x] Commit + push (`0892af3`)
- [x] PROD NOT RUN
