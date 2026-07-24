# Msg Auto → Links

Story 90. Route: `/dashboard/msg-automation/links`.

Connect CHAD leads with Beeper conversations via a three-panel visual map
(mockup: `examples/CHAD_Msg_Auto_Links_page_mockup_v5.html`).

## Sources

- CHAD leads: `getAllLeadsWithContacts` + contact phones from `getLeadDetails`
- Beeper conversations: contacts in per-user Beeper Mongo (`beeper_<repoGuid>`)
- Saved links: collection `lead_conversation_links` in the same Beeper DB

## Model

`LeadBeeperLink` — `method`: automatic | manual | suggested; `source`:
contact | name | phone | manual. GUI shows status + phone only (no loca / ids).

## Drag

Handles on lead (right edge) and conversation (left edge). Drag only from
dots; lines computed from live DOM positions (resize + panel scroll).

## Auto-match

`POST /api/msg-automation/links/auto-match` — working state only.
Exact normalized phone → automatic; last-9 partial → suggested; never
overwrites manual. Persist with **Save**.

## Save

`POST /api/msg-automation/links` with `{ links }`. Full replace in
`lead_conversation_links`. Dirty until Save; Saved flash after success.

## Isolation

`getCurrentUserFromCookies` + `runWithRepoContext`; Beeper DB per
`repoGuid`. No client `repoGuid`.

## Tests

`packages/dba/src/lead-beeper-links.test.ts` (vitest).
