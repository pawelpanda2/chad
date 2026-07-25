# Story 90 — Plan

## Goal

Msg Auto → **Links** page: connect CHAD leads with Beeper conversations
(visual canvas + auto-match + Save), mockup `examples/CHAD_Msg_Auto_Links_page_mockup_v5.html`.

## Approach

1. **Storage:** per-user Beeper Mongo `beeper_<repoGuid>` collection
   `lead_conversation_links` (same isolation model as Beeper CRM).
2. **DBA** `lead-beeper-links.ts`: page data, save (full replace), auto-match
   (exact phone → automatic; partial → suggested; never overwrite manual).
3. **API:** thin `GET/POST /api/msg-automation/links`,
   `POST .../auto-match` via `runWithRepoContext`.
4. **UI:** `/dashboard/msg-automation/links` — 3-column layout, SVG lines from
   DOM handle positions, bottom bar Auto-match + Save only.
5. **Hub:** Links tile between Creator and AI Prompts.
6. **Tests:** vitest for match/save rules; API smoke; build dba + dashboard.
7. **Docs:** feature doc + Story knowledge; commit/push/deploy TEST.
