# Saving Conversations to Content Provider

## Overview

This document describes the correct way to save conversations (e.g., WhatsApp chats) to the Content Provider. The key principle is:

**POST -> PUT flow**

## Core Principle

| Operation | Purpose |
|-----------|---------|
| **POST** | create-or-get: creates if doesn't exist, returns existing if already exists |
| **PUT** | save content: writes data to an existing item |
| **GET** | only when 100% sure item exists: use sparingly |

## Flow for Saving Conversations

### Step 1: POST (Create-or-Get)

First, execute POST for the path:

```
beeper / whatsup / [lead_name] / beeper
```

This POST acts as create-or-get:
- If the item doesn't exist → creates it
- If the item already exists → returns the existing item

The POST returns an item with its `loca` (location address).

### Step 2: PUT (Save Content)

After getting the `loca` from POST, use PUT to save the content:

```
Put(repoId, loca, Text, content)
```

### Complete Flow

```
POST beeper / whatsup / [lead_name] / beeper
    ↓
Extract loca from response
    ↓
PUT loca, Text, [conversation in WhatsApp format]
```

## Implementation in chad-dba

### Helper Method: `postItemByNames`

The `postItemByNames` function in `src/leads.ts` implements the POST create-or-get logic:

```typescript
export async function postItemByNames(
  repoId: string,
  names: string[]
): Promise<PostItemByNamesResult>
```

This function:
1. Gets the root item using GetByNames (entry point)
2. For each subsequent name, uses PostParentItem (create-or-get)
3. Returns `{ loca, address, name, item }`

### Helper Method: `saveBeeperWhatsappConversation`

The recommended way to save WhatsApp conversations:

```typescript
export async function saveBeeperWhatsappConversation(
  leadName: string,
  content: string
): Promise<{ loca: string; address: string; success: boolean }>
```

This function:
1. Calls `postItemByNames(SHARED_REPO_ID, ["beeper", "whatsup", leadName, "beeper"])`
2. Calls PUT to save the content
3. Returns the result with loca and address

## Usage from Python

Python code should call the chad-dba helper:

```python
# Invoke the chad-dba helper
result = invoke_cp([
    "IRepoService",
    "IItemWorker", 
    "PostParentItem",
    SHARED_REPO_ID,
    parentLoca,
    "Text",
    itemName
])
```

Or use the high-level helper:

```python
result = invoke_cp([
    # saveBeeperWhatsappConversation equivalent
    # POST -> PUT flow
])
```

## Reporting

When saving, print:

```
POST OK: [lead_name] -> loca: ...
PUT OK: [lead_name] -> saved X messages
```

Or on error:

```
ERROR: [lead_name] -> [error description]
```

## What NOT to Do

### ❌ Don't use GET for writing

```typescript
// WRONG: Using GetByNames to "find or create"
const item = await invokeContentProvider([
  "IRepoService",
  "IItemWorker",
  "GetByNames",  // This is GET, not POST!
  repoId,
  "beeper",
  "whatsup",
  leadName,
  "beeper"
]);
```

### ❌ Don't manually check existence

```typescript
// WRONG: Manually checking if item exists
const existing = await checkIfExists(path);
if (!existing) {
  await createItem(path);
}
```

### ❌ Don't create each level manually

```typescript
// WRONG: Python manually creating each level
# Python should NOT do this:
# if not exists(beeper): create(beeper)
# if not exists(whatsup): create(whatsup)
# if not exists(lead): create(lead)
```

## Correct Examples

### Example 1: Using postItemByNames

```typescript
// POST -> get loca
const result = await postItemByNames(SHARED_REPO_ID, [
  "beeper",
  "whatsup", 
  "26-05-12_pi_Agata",
  "beeper"
]);

// PUT -> save content
await invokeContentProvider([
  "IRepoService",
  "IItemWorker",
  "Put",
  SHARED_REPO_ID,
  result.loca,
  "Text",
  "beeper",
  conversationContent
]);
```

### Example 2: Using saveBeeperWhatsappConversation

```typescript
// One function does POST -> PUT
const result = await saveBeeperWhatsappConversation(
  "26-05-12_pi_Agata",
  conversationContent
);

console.log(`Saved to: ${result.address}`);
```

## When to Use GET

Use GET (GetByNames) only when:
- You're 100% sure the item exists
- You're reading data (not writing)
- Examples:
  - Fetching `leads / all items / [lead_name] / contacts`
  - Fetching list of leads
  - Diagnostics

## Summary

| Task | Method |
|------|--------|
| Ensure path exists before writing | `postItemByNames` (POST) |
| Save content to item | `Put` (PUT) |
| Full conversation save | `saveBeeperWhatsappConversation` |
| Read existing data | `GetByNames` (GET) - only when certain |