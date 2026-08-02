# `config.links.beeper` schema and the stable-messageId decision

## The stable identifier problem

The message id the Beeper Conversations GUI already shows
(`ParsedWhatsAppMessage.id`, from `whatsapp-messages.ts`) is
`stableWhatsAppMessageId(timestamp, sender, rawLine, occurrence)` — an
FNV-1a hash over the message's own formatted export line. It is
deterministic (same content → same id) but **not a database key**: if the
underlying message's text or timestamp ever changed, the hash would
change, silently breaking any link keyed on it.

`ai-docs/beeper/mongo-schema.md`'s `messages` collection has two other
candidate fields:

- `beeperMessageID` — **nullable**, and only unique in combination with
  `network` (a partial unique index). Not usable alone as a stable key.
- `_id` (Mongo `ObjectId`) — always present, globally unique per document,
  never recomputed from content.

**Decision: `links.beeper.messageId` is the stringified Mongo `_id`.**

## Threading `_id` to the client

The dashboard never saw `_id` before this Story — `GET
/api/beeper-crm/contacts/[id]` only returned the content-hash-derived
`conversationMessages` via `beeperMessagesToParsedMessages`. Story 99 adds
(`packages/dba/src/whatsapp-messages.ts`):

- `ParsedWhatsAppMessage.dbId?: string` — additive field, nothing existing
  reads or breaks on it.
- `beeperMessagesToParsedMessagesWithDbId(messages)` — same
  format+parse round-trip, but zips each parsed message back to its source
  `_id` by index (safe because `formatBeeperMessagesForExport`'s
  `text && timestamp` filter is applied identically to both the formatted
  text and the id list before parsing, and every generated line always
  matches `parseWhatsAppMessages`'s regex — confirmed 1:1 correspondence).
- `GET /api/beeper-crm/contacts/[id]` now calls this dbId-aware function
  instead of the original one. The content-hash `id` field is unchanged —
  nothing that already depends on it (Message Creator's
  `onSelectMessage`/`analysisContextMessageIds`) is affected.
- `beeper-conversation-view.tsx`'s client-side `ParsedWhatsAppMessage`
  interface (an intentionally-duplicated copy, per its own comment) got the
  same `dbId?: string` field.

## Schema

Written to the msg workout Text item's own `config.links.beeper`:

```yaml
links:
  beeper:
    messageId: "<stringified Mongo ObjectId>"
    timestamp: "2026-08-01T14:16:00.000Z"   # ISO 8601 — the message's OWN timestamp
    linkedAt: "2026-08-01T14:20:03.512Z"    # ISO 8601 — when this link was written
    method: "automatic" | "manual"
```

- `packages/dba/src/msg-workout-linking.ts` is the only place that reads or
  writes this key.
- Written via `item-ops.ts`'s `putItemConfig` — a config-only write, the
  item's `body` (the workout's own text) is never touched.
- **Idempotent by construction**: `writeMsgWorkoutBeeperLink` checks
  `config.links?.beeper` first and returns the item unchanged (no CP write
  at all) if it's already set — this is what makes rerunning
  `analyzeMsgWorkoutsForLead` safe, and what "manual link never
  auto-overwritten" means in practice (there is currently no separate
  manual-linking UI in this Story, but the schema doesn't distinguish who
  set `method: "manual"` from a future feature that would — the check is
  purely "does `links.beeper` already exist," never "was it automatic").
- Writing preserves every other existing `config` key, including any other
  `config.links.*` entries (`{ ...existingLinks, beeper: {...} }`, never a
  blind overwrite of the whole `links` object).

Verified end-to-end (write → real-Postgres read-back → idempotent rerun →
other `config.links.*` keys preserved) in
`packages/dba/src/msg-workout-cp.test.ts`.
