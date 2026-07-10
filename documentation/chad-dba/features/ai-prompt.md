# AI Prompt Building Flow

## Overview

This document describes the flow for building prompts for OpenAI when analyzing a girl/lead situation. The prompt is built from **real data** fetched from the Content Provider, including both the report and the beeper conversation.

## Data Sources

### 1. Report

**Source:** `reports` folder in the shared repository

**Repository:** `21d11bdc-f1f4-44d1-b61a-3fa6b039c641`

**Structure:**
```
reports/ (folder)
  01/ (daygame category)
    items containing lead reports
  02/ (nightgame category)
    items containing lead reports
```

The reports folder has categories as children, and each category contains report items for various leads.

### 2. Conversation (Beeper)

**Source:** `beeper` folder in the shared repository

**Repository:** `21d11bdc-f1f4-44d1-b61a-3fa6b039c641`

**Structure:**
```
beeper/ (folder)
  01/ (whatsapp channel)
    01/ (lead conversation - body contains "26-05-30_pn_Olia")
    02/ (lead conversation - body contains "26-05-30_pn_Marzena")
  02/ (instagram channel)
    01/ (lead conversation)
```

The beeper folder has channels as children (whatsapp, instagram, etc.), and each channel contains lead conversations.

## Finding a Report

### Algorithm (chad_FindReportsByLeadName)

The report is found using a traversal algorithm with FindRecursively:

#### Step 1: Get the Reports Folder

```typescript
["IRepoService", "IItemWorker", "GetByNames", repoId, "reports"]
```

Response:
```json
{
  "Settings": {
    "address": "21d11bdc-f1f4-44d1-b61a-3fa6b039c641/05"
  },
  "Body": {
    "01": "daygame",
    "02": "nightgame"
  }
}
```

#### Step 2: Iterate Through Categories

For each child in `reports.Body`:
- Build category address: `reportsAddress + "/" + categoryKey`
- Example: `21d11bdc-f1f4-44d1-b61a-3fa6b039c641/05/01`

#### Step 3: Use FindRecursively

```typescript
["IRepoService", "IMethodWorker", "FindRecursively", repo, loca, leadName]
```

This searches recursively for items matching the lead name within the category folder.

#### Step 4: Collect Results

If FindRecursively returns items, take the first one as the main report. The result includes:
- `body`: The report content
- `address`: The item's full address
- `name`: The item's name
- `category`: The category name where it was found

## Finding a Conversation

### Algorithm (chad_FindConversationByLeadName)

The conversation is found using a traversal algorithm:

#### Step 1: Get the Beeper Folder

```typescript
["IRepoService", "IItemWorker", "GetByNames", repoId, "beeper"]
```

Response:
```json
{
  "Settings": {
    "address": "21d11bdc-f1f4-44d1-b61a-3fa6b039c641/04"
  },
  "Body": {
    "01": "whatsapp",
    "02": "instagram"
  }
}
```

#### Step 2: Iterate Through Channels

For each child in `beeper.Body`:
- Build media address: `beeperAddress + "/" + channelKey`
- Example: `21d11bdc-f1f4-44d1-b61a-3fa6b039c641/04/01`

#### Step 3: Get Channel Item

```typescript
["IRepoService", "IItemWorker", "GetItem", repo, mediaLoca]
```

Response:
```json
{
  "Settings": {
    "address": "21d11bdc-f1f4-44d1-b61a-3fa6b039c641/04/01"
  },
  "Body": {
    "01": "26-05-30_pn_Olia",
    "02": "26-05-30_pn_Marzena"
  }
}
```

#### Step 4: Search for Lead Name

Search in the channel's Body for a value matching the lead name.

#### Step 5: Get Conversation Item

If found, build final address: `mediaAddress + "/" + foundKey`

```typescript
["IRepoService", "IItemWorker", "GetItem", repoId, finalLoca]
```

The Body of this item is the conversation text.

## Flow Description

### Step 1: User Selects a Girl

The user selects a girl from a filtered list. At this point we have:
- `name`: The girl's name (e.g., `26-05-30_pn_Olia`)
- `loca`: The girl's location address (e.g., `03/06/79`)

### Step 2: Fetch Data

Use the helper functions:

```typescript
const girlData = await getGirlData(leadName);
```

This fetches both reports and conversation in parallel.

### Step 3: Summary + Submenu (AI Prompt Preview Submenu)

After fetching data, display only a short summary - do NOT automatically display full reports, chats, or prompt:

```
Znaleziono dla: 26-05-30_pn_Olia
- 1 raport w daygame: full report
- 1 chat w whatsapp

Co teraz?
1. Wyświetl cały prompt
2. Wyświetl raporty znalezione
3. Wyświetl chaty znalezione
4. Powrót
```

The user then chooses what to display. This approach:
- Avoids overwhelming the user with too much information at once
- Gives the user control over what they want to see
- Only asks about sending to OpenAI after explicitly viewing the full prompt

#### Option 1: Wyświetl cały prompt

Display the full prompt preview:

```
📄 PREVIEW - Full prompt:
<current_case>

name: 26-05-30_pn_Olia

report:
(full report body here)

conversation:
(full conversation body here)

my_question:
Przeanalizuj tę sytuację według materiału mentora i powiedz co teraz zrobić.

</current_case>
```

Then ask:
```
Wysłać ten prompt do OpenAI?
1. tak
2. nie / wróć
```

- If "tak": Call OpenAI API, display response, then return to main menu
- If "nie / wróć": Return to submenu (do NOT call OpenAI)

#### Option 2: Wyświetl raporty znalezione

Display a list of found reports:
```
Wybierz raport do wyświetlenia:
1. daygame; full report; 21d11bdc-f1f4-44d1-b61a-3fa6b039c641/05/01/02
0. Powrót
```

After selection, display the full report body, then return to submenu.

#### Option 3: Wyświetl chaty znalezione

Display a list of found chats:
```
Wybierz chat do wyświetlenia:
1. whatsapp; 26-05-30_pn_Olia
0. Powrót
```

After selection, display the full chat body, then return to submenu.

#### Option 4: Powrót

Return to the main menu without sending anything to OpenAI.

### Important Rules

1. **No automatic full content display**: Never automatically display the full report, full conversation, or full prompt immediately after finding data.
2. **OpenAI call only after explicit choice**: The question "Wysłać ten prompt do OpenAI?" appears ONLY after the user explicitly chooses option 1 (Wyświetl cały prompt) and sees the full prompt preview.
3. **Loop until action**: The submenu loops until the user either sends to OpenAI or chooses to return to main menu.

### Step 4 (conditional): Build Final Prompt

The prompt is built in the following format:

```xml
<current_case>

name: 26-05-30_pn_Olia

report:
(full body of the report, or [not found])

conversation:
(full body of the conversation, or [not found])

my_question:
Przeanalizuj tę sytuację według materiału mentora i powiedz co teraz zrobić.

</current_case>
```

## Fallbacks

### When Report is Not Found

```xml
<current_case>

name: {girl_name}

report:
[not found]

conversation:
{conversation_body}

my_question:
Przeanalizuj tę sytuację według materiału mentora i powiedz co teraz zrobić.

</current_case>
```

### When Conversation is Not Found

```xml
<current_case>

name: {girl_name}

report:
{report_body}

conversation:
[not found]

my_question:
Przeanalizuj tę sytuację według materiału mentora i powiedz co teraz zrobić.

</current_case>
```

### When Both are Not Found

```xml
<current_case>

name: {girl_name}

report:
[not found]

conversation:
[not found]

my_question:
Przeanalizuj tę sytuację według materiału mentora i powiedz co teraz zrobić.

</current_case>
```

## Helper Functions

### chad_FindReportsByLeadName(leadName: string)

Main function for finding reports. Returns `ReportResult[]`:

```typescript
interface ReportResult {
  found: boolean;
  body: string | null;
  address: string | null;
  name: string | null;
  category: string | null;
  error?: string;
}
```

### chad_FindConversationByLeadName(leadName: string)

Main function for finding a conversation. Returns `ConversationResult`:

```typescript
interface ConversationResult {
  found: boolean;
  body: string | null;
  address: string | null;
  channel: string | null;
  error?: string;
}
```

### parseAddressToRepoLoca(address: string)

Parses an address string into repo and loca components:

```typescript
const { repo, loca } = parseAddressToRepoLoca("21d11bdc-f1f4-44d1-b61a-3fa6b039c641/04/01");
// repo: "21d11bdc-f1f4-44d1-b61a-3fa6b039c641"
// loca: "04/01"
```

### joinAddress(address: string, childKey: string)

Joins an address with a child key:

```typescript
const newAddress = joinAddress("21d11bdc-f1f4-44d1-b61a-3fa6b039c641/04", "01");
// "21d11bdc-f1f4-44d1-b61a-3fa6b039c641/04/01"
```

### readBodyMap(item: any)

Reads a body as a key-value map. Handles both object and JSON string formats:

```typescript
const map = readBodyMap(item);
// { "01": "whatsapp", "02": "instagram" }
```

## Important Notes

1. **No Mock Data**: The prompt must be built from real data fetched from the Content Provider.

2. **Name Matching**: The girl's name must match exactly (e.g., `26-05-30_pn_Olia`).

3. **Report Search**: Uses `FindRecursively` to search through all report categories. The first found item is used as the main report.

4. **Channel Iteration**: The conversation algorithm iterates through ALL channels in the beeper folder, not just whatsapp. This ensures the conversation is found regardless of which platform it's on.

5. **Body Parsing**: The `readBodyMap` function handles both object and JSON string formats for the Body field.

6. **Question**: The `my_question` field is a standard question asking the mentor's AI to analyze the situation and provide guidance.

## Example Request/Response Flow

### Finding a Report

**Step 1 - Get Reports:**
```typescript
["IRepoService", "IItemWorker", "GetByNames", repoId, "reports"]
```

**Step 2 - FindRecursively in category:**
```typescript
["IRepoService", "IMethodWorker", "FindRecursively", repoId, "05/01", "26-05-30_pn_Olia"]
```

### Finding a Conversation

**Step 1 - Get Beeper:**
```typescript
["IRepoService", "IItemWorker", "GetByNames", repoId, "beeper"]
```

**Step 2 - Get Channel (whatsapp):**
```typescript
["IRepoService", "IItemWorker", "GetItem", repoId, "04/01"]
```

**Step 3 - Get Conversation:**
```typescript
["IRepoService", "IItemWorker", "GetItem", repoId, "04/01/01"]