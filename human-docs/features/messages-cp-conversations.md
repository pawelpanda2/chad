# Messages - Content Provider Conversations

## Overview

The Messages page displays real WhatsApp conversations stored in the Content Provider database, replacing mock data with actual lead conversations.

## Data Source

### Content Provider Repository

- **Repository ID**: `21d11bdc-f1f4-44d1-b61a-3fa6b039c641` (shared repository)
- **Path Structure**: `beeper / whatsup / [lead_name] / beeper`

### Data Flow

```
chad-dashbord (client)
    ↓ fetch /api/beeper/leads
chad-dashbord (server API route)
    ↓ imports chad-dba
chad-dba (getAllBeeperWhatsappLeads)
    ↓ invokes Content Provider API
Content Provider API
    ↓ reads from repository
File System / Database
```

## chad-dba Helpers

Located in `../chad-dba/src/beeper.ts`:

### `getAllBeeperWhatsappLeads(): Promise<string[]>`

Returns a sorted list of all lead names that have WhatsApp conversations stored in the beeper.

**Algorithm:**
1. Fetch the `beeper` folder from the shared repository
2. Iterate through all channel folders (children of beeper)
3. For each channel, check if leads have a `beeper` child item
4. Collect and return unique lead names

### `getBeeperWhatsappConversation(leadName: string): Promise<string | null>`

Returns the raw WhatsApp conversation content for a specific lead.

**Algorithm:**
1. Fetch the `beeper` folder
2. Search through channels to find the lead by name
3. Navigate to `beeper/whatsup/[lead_name]/beeper`
4. Return the Body content as a string

## API Routes

### `GET /api/beeper/leads`

Returns a JSON array of lead names:

```json
["26-05-11_pn_Luba", "26-05-30_pn_Roksana_Characzko", "26-06-07_pt_Ariadna"]
```

### `GET /api/beeper/conversation?lead=<leadName>`

Returns conversation data:

```json
{
  "lead": "26-05-11_pn_Luba",
  "content": "[11/05/2026, 15:11:51] you: ok, to już wychodzę\n[11/05/2026, 15:25:23] she: Jestem ty"
}
```

## WhatsApp Message Parser

The parser converts raw WhatsApp export format into structured messages.

### Input Format

```
[DD/MM/YYYY, HH:MM:SS] sender: message text
[DD/MM/YYYY, HH:MM:SS] you: my message
[DD/MM/YYYY, HH:MM:SS] she: her message
‎<attached: filename.jpg>
```

### Parsing Rules

| Sender | Display | Alignment |
|--------|---------|-----------|
| `you` | Right bubble (primary color) | `justify-end` |
| `she` | Left bubble (muted background) | `justify-start` |
| Other | System message (centered, small) | `justify-center` |

### Attachment Handling

Attachments in format `‎<attached: filename>` are displayed as:
```
📎 Attachment: filename
```

### Unparsed Lines

Lines that don't match the WhatsApp pattern are displayed as system messages (centered, muted, small text).

## UI Layout

### Responsive Design

**Desktop (lg breakpoint and above):**
```
┌─────────────────┬───────────────────────────────┐
│                 │                               │
│   Leads List    │      Conversation View        │
│   (1 column)    │       (2 columns)             │
│                 │                               │
│   Fixed width   │      Flexible width           │
│   with own      │      with scroll              │
│   scrollbar     │                               │
└─────────────────┴───────────────────────────────┘
```

**Mobile (below lg breakpoint):**
```
┌─────────────────┐
│   Leads List    │  (full width, limited height)
│   (stacked)     │
├─────────────────┤
│                 │
│  Conversation   │  (stacked below)
│                 │
└─────────────────┘
```

### Left Panel Specifications

- **One line per lead**: Single row with lead name
- **No avatars**: Text-only display
- **No preview**: Just the lead name
- **No badges**: Clean, minimal design
- **Ellipsis**: Long names are truncated with `...`
- **Active highlight**: Selected lead has `bg-accent` background
- **Own scrollbar**: `overflow-y: auto` on the list container
- **Compact spacing**: `py-2.5` vertical padding per item

### Right Panel Specifications

- **Message bubbles**: Rounded corners with directional styling
- **Timestamps**: Small text (`text-[10px]`) below message
- **Scroll behavior**: Auto-scroll to bottom on new messages
- **Empty states**: Clear messaging when no conversation found

## Loading & Error States

### Loading Leads
- Spinner with "Loading leads..." text
- Centered in the left panel

### Loading Conversation
- Spinner with "Loading messages..." text
- Centered in the right panel

### Error States
- Error icon with message
- Retry button for leads loading
- Graceful fallback for missing conversations

### Empty States
- "No conversations found" when no leads exist
- "No leads match your search" for filtered results
- "No messages found for this lead" for empty conversations

## Security Considerations

- **No CP credentials in client bundle**: All Content Provider access happens server-side
- **Environment variables**: `CONTENT_PROVIDER_API_URL` is only accessed on the server
- **API routes as proxy**: Client fetches from `/api/*` endpoints, not directly from CP

## Files Modified

1. `../chad-dashbord/app/api/beeper/leads/route.ts` - New API route
2. `../chad-dashbord/app/api/beeper/conversation/route.ts` - New API route
3. `../chad-dashbord/app/(dashboard)/dashboard/messages/page.tsx` - Updated to use API routes

## Files Referenced (chad-dba)

1. `../chad-dba/src/beeper.ts` - Contains `getAllBeeperWhatsappLeads` and `getBeeperWhatsappConversation`
2. `../chad-dba/src/client.ts` - Contains `invokeContentProvider` for CP API calls
3. `../chad-dba/src/index.ts` - Exports all public functions