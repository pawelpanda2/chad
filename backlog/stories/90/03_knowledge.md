# Story 90 — Knowledge

## Storage choice

Links live in **per-user Beeper Mongo** (`beeper_<repoGuid>`), collection
`lead_conversation_links`, not Content Provider.

Reason: Beeper CRM (contacts/conversations) is already isolated per
`repoGuid` in Beeper Mongo (Story 73). Lead↔conversation links are CRM
pairing data that must follow the same isolation — a global Mongo DB or CP
tree would either leak across users or mix Beeper IDs into CP addresses
unnecessarily.

## Phone match (v1)

- Normalize: digits only (`normalizePhoneDigits`).
- Exact equal normalized strings → `method: automatic`, `source: phone`.
- Same last-9 digits but full strings differ → `suggested`.
- No phone / low digit count → no auto link.
- Existing `manual` links are never replaced by auto-match.

## Navigation

- Lead name → `/dashboard/leads/details?leadName=&leadLoca=`
- Conversation → `/dashboard/beeper/[contactId]`
- Back → `/dashboard/msg-automation`
