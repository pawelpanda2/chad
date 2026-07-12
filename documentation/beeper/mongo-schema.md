# Beeper CRM — MongoDB schema

Database: the shared `chad` MongoDB database (same instance as Content
Provider's future `content_provider_files` collection and any other future
dashboard features — see
`documentation/ai-docs/26-07-10_cline_prompt_mongodb_qnap_folders_v3.md` for
the "one Mongo instance, many collections" decision this follows). No ORM —
native `mongodb` driver, same as the source project.

All collection shapes below are unchanged from the standalone `contacts`
project (ported as-is) except where noted. Source: `contacts/packages/beeper-sync/lib/db.mjs`,
`contacts/packages/beeper-oplog/index.mjs`, `contacts/packages/dashboard/src/lib/db.js`.

## Collections

### `contacts`

One document per person (a merged identity across networks).

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `displayName` | string | |
| `notes`, `bio` | string | |
| `tags` | string[] | subset of `business`, `romantic`, `friends`, `spam` |
| `avatarURL` | string \| null | base64 data URI (`data:image/...;base64,...`) or external URL |
| `identities` | `{ network, senderID, senderName?, username? }[]` | one entry per network identity |
| `phones` | `{ number, label }[]` | |
| `socialLinks` | string[] | |
| `mergedInto` | ObjectId \| undefined | set when this contact was absorbed by another (see Merge below) |
| `mergedFrom` | ObjectId[] | contacts absorbed into this one |
| `deletedAt` | Date \| null | set alongside `mergedInto` |
| `ratingStatus`, `ratingPriority`, `direction`, `nextStep`, `nextStepDate`, `attractiveness`, `interest`, `availability`, `haremPotential`, `redFlags` | mixed | personal CRM/dating-tracking fields, opaque to the sync pipeline — only read/written by the dashboard |
| `createdAt`, `updatedAt` | Date | |

**Indexes:**
- `{ "identities.senderID": 1 }` unique, partial (`$type: "string"` — so multiple contacts can have no/`null` senderID without violating uniqueness)
- `{ tags: 1 }`

### `channels`

One document per chat (direct or group), per network.

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `beeperChatID` | string | Beeper's own chat ID |
| `network` | string | e.g. `whatsapp`, `telegram`, `imessage`, `signal`, `gcm`/`sms` |
| `type` | `"direct"` \| `"group"` | |
| `title` | string \| null | |
| `participantIDs` | ObjectId[] | references into `contacts` |
| `lastMessageAt` | Date \| null | |
| `createdAt` | Date | |

**Indexes:**
- `{ beeperChatID: 1 }` unique, sparse
- `{ participantIDs: 1 }`
- `{ lastMessageAt: -1 }`

### `messages`

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `beeperMessageID` | string \| null | Beeper/Matrix message ID — REST sync can produce numeric IDs, SQLite import produces Matrix `$...` IDs for the *same* message; see dedup strategy below |
| `channelID` | ObjectId \| null | references `channels` |
| `contactID` | ObjectId \| null | references `contacts` (sender, for group messages; null/self for own messages) |
| `isSelf` | boolean | |
| `network` | string | |
| `type` | string | `TEXT`, `IMAGE`, `VIDEO`, `FILE`, `STICKER`, `VOICE`, `AUDIO`, `LOCATION`, `REACTION` (reactions are folded into the target message, not stored as separate `REACTION` messages, by both `beeper-oplog` and the merge logic — a `type: REACTION` document should not normally exist except transiently) |
| `text` | string | |
| `attachments` | array | `{ type, mimeType, fileName, fileSize, srcURL/id, size?: {width,height}, isGif? }` (mxc:// URL parsed into a media ID by the dashboard) |
| `reactions` | `{ senderID, emoji }[]` | |
| `timestamp` | Date | |
| `isUnread` | boolean | |
| `deletedAt` | Date \| null | soft-delete |
| `createdAt`, `updatedAt` | Date | |

**Indexes:**
- `{ beeperMessageID: 1, network: 1 }` unique, partial (`beeperMessageID: { $type: "string" }`)
- `{ channelID: 1, timestamp: -1 }`
- `{ contactID: 1, timestamp: -1 }`
- `{ channelID: 1, timestamp: 1, isSelf: 1 }` — cross-source dedup (see below)

**Dedup strategy (why two indexes look redundant):** the same message can
arrive with a numeric ID from the REST API and a Matrix `$...` ID from the
local SQLite import. Primary dedup is by `(beeperMessageID, network)`; when
`beeperMessageID` differs across sources for what's actually the same
message, a fallback match on `(channelID, timestamp, isSelf)` catches it,
and the Matrix ID is preferred over the numeric one when both are seen.

### `timeline_events`

Manually-added entries (meetings, notes, milestones, calls) interleaved into
a contact's message timeline.

| Field | Type |
|---|---|
| `_id` | ObjectId |
| `contactID` | ObjectId (→ `contacts`) |
| `type` | `"meeting"` \| `"note"` \| `"milestone"` \| `"call"` |
| `timestamp` | Date |
| `title`, `description` | string |
| `createdAt`, `updatedAt` | Date |

**Index:** `{ contactID: 1, timestamp: 1 }`

### `sync_state`

One document per channel — tracks `beeper-sync`'s incremental-sync
watermark (last-synced timestamp) so re-runs don't refetch everything.

| Field | Type |
|---|---|
| `_id` | ObjectId |
| `chatID` | string, unique |
| ...sync metadata (last timestamp, etc.) | set by `beeper-sync/lib/db.mjs`'s `setSyncState` |

**Index:** `{ chatID: 1 }` unique

### `beeper_events`

Raw event log: every WebSocket event `beeper-ws` receives, written verbatim
plus a `_receivedAt` timestamp. This is the *input* `beeper-oplog` watches
via a change stream and normalizes into `contacts`/`channels`/`messages`.
Never read directly by the dashboard.

| Field | Type |
|---|---|
| `_id` | ObjectId |
| `type` | string, e.g. `message.upserted`, `message.deleted`, `chat.upserted` |
| `seq` | number (sparse) |
| `chatID` | string (sparse) |
| `entries` | array (event-type-specific payload) |
| `_receivedAt` | Date |

**Indexes:** `{ type: 1 }`, `{ seq: 1 }` sparse, `{ chatID: 1 }` sparse

### `merge_suggestions`

Migrated for completeness but **not read by the new dashboard UI** (see
"Known limitations" #4 in `architecture.md` — this was for a Google-enrich
feature that was never fully live). The live merge-suggestion feature
(`getBeeperMergeSuggestions` in `dba`) computes fuzzy name-match suggestions
on the fly instead of reading from a collection.

## Relations

```
contacts (1) ──< participantIDs >── (N) channels
contacts (1) ──< contactID >──────── (N) messages
contacts (1) ──< contactID >──────── (N) timeline_events
contacts (1) ──< mergedInto >──────── (1) contacts   (self-reference, merge)
channels (1) ──< channelID >───────── (N) messages
beeper_events ──(consumed by beeper-oplog, normalized into)──> contacts/channels/messages
```

## Data flow (who writes what)

| Writer | Writes to |
|---|---|
| `beeper-ws` | `beeper_events` (raw, append-only) |
| `beeper-oplog` | `contacts`, `channels`, `messages` (normalized from `beeper_events` via change stream) |
| `beeper-sync` | `contacts`, `channels`, `messages`, `sync_state` (from SQLite + REST, bypassing `beeper_events` entirely — a separate, direct ingestion path) |
| dashboard (via `dba`) | `contacts` (profile/tags edits, merges), `timeline_events` (manual events) |

Note `beeper-sync` and `beeper-oplog`/`beeper-ws` are two **independent**
ingestion paths into the same normalized collections — this is intentional
(SQLite import for full history, live WS+oplog for real-time), and the
dedup indexes on `messages` exist specifically to reconcile them.
