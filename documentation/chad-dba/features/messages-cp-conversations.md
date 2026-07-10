# Feature: Messages - WhatsApp Conversations from Content Provider

## Overview

The Messages page displays WhatsApp conversations stored in the Content Provider. It shows ALL leads from the repository, not just those with saved conversations.

## Storage Structure

### Leads Repository
```
leads/
    └── all items/
            ├── 01 → "26-05-11_pn_Luba"
            ├── 02 → "26-05-29_pn_Amelia"
            ├── 03 → "26-05-30_pn_Olia"
            └── ... (more leads)
```

Each lead is stored as a key-value pair where:
- Key: numeric identifier (e.g., "01", "02")
- Value: lead name (e.g., "26-05-11_pn_Luba")

### Beeper Conversations
```
beeper/
    └── whatsup/
            ├── 01/
            │   ├── 01 → "26-05-11_pn_Luba"
            │   └── 02 → "beeper" (conversation content)
            ├── 02/
            │   ├── 01 → "26-05-29_pn_Amelia"
            │   └── 02 → "beeper" (conversation content)
            └── ... (more channels/leads)
```

### Target Structure (with multiple sources)
```
beeper/
    └── [lead_name]/           (Folder)
            ├── beeper         (Text) - WhatsApp conversation
            ├── manual         (Text) - Manual notes
            ├── telegram       (Text) - Telegram conversation
            └── instagram      (Text) - Instagram conversation
```

## API Endpoints

### GET /api/beeper/leads

Returns all leads from the repository.

**Response:**
```json
[
  "26-05-11_pn_Luba",
  "26-05-29_pn_Amelia",
  "26-05-30_pn_Olia"
]
```

**Implementation:**
```typescript
import { getAllLeadsFromRepository } from "chad-dba";

export async function GET() {
  const leads = await getAllLeadsFromRepository();
  return NextResponse.json(leads);
}
```

### GET /api/beeper/conversation/[leadName]

Returns the WhatsApp conversation for a specific lead.

**Response (success):**
```json
{
  "ok": true,
  "content": "[01/02/2026, 14:30:00] you: Hello\n[01/02/2026, 14:31:00] she: Hi there!"
}
```

**Response (not found):**
```json
{
  "ok": false,
  "error": "Lead not found in any beeper channel"
}
```

## UI Behavior

### Lead List (Left Panel)
- Shows ALL leads from `leads/all-items`
- Sorted alphabetically
- Searchable by name
- Displays count of total leads

### Conversation View (Right Panel)
- When a lead is selected, attempts to load their conversation
- If conversation exists: displays messages in chat format
- If no conversation: displays "Conversation unavailable" with explanation

### Message Format
Messages are parsed from WhatsApp export format:
```
[DD/MM/YYYY, HH:MM:SS] sender: message
```

- "you" messages → displayed on right (primary color)
- "she" messages → displayed on left (muted color)
- Attachments → shown as "📎 Attachment: filename"

## chad-dba Functions

### getAllLeadsFromRepository()
Fetches all leads from `leads/all-items`. This is the authoritative source for all leads.

```typescript
export async function getAllLeadsFromRepository(): Promise<string[]>
```

### getAllBeeperWhatsappLeads()
Scans the beeper structure to find leads that have saved WhatsApp conversations.

```typescript
export async function getAllBeeperWhatsappLeads(): Promise<string[]>
```

### getBeeperWhatsappConversation(leadName)
Retrieves the WhatsApp conversation content for a specific lead.

```typescript
export async function getBeeperWhatsappConversation(leadName: string): Promise<string | null>
```

### chad_FindConversationByLeadName(leadName)
Finds a conversation for a lead, returning detailed result information.

```typescript
export async function chad_FindConversationByLeadName(leadName: string): Promise<ConversationResult>
```

## Related Documentation

- [Bug: Beeper Lead Node Created as Text Instead of Folder](./bugs/beeper-lead-node-created-as-text-instead-of-folder.md)
- [Import chad-dba in Neighbor Projects](./import-dba.md)
- [Save Conversation](./features/save-conversation.md)