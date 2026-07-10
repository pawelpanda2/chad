# Bug: Status Creation Duplicates Repo GUID in Path

## Status
Fixed on 2026-07-06

## Description

When creating a status for a lead, the code was incorrectly using the full address (which includes the repo GUID prefix) as the `loca` parameter for `putStatusContent`. This resulted in paths like:

```
repos/21d11bdc-f1f4-44d1-b61a-3fa6b039c641/21d11bdc-f1f4-44d1-b61a-3fa6b039c641/03/06/89/03
```

Instead of the correct:
```
repos/21d11bdc-f1f4-44d1-b61a-3fa6b039c641/03/06/89/03
```

## Root Cause

In `chad-console/src/cli.ts`, after creating a status item with `createStatusForLead()`, the response contains a full address like:
```
21d11bdc-f1f4-44d1-b61a-3fa6b039c641/03/06/89/03
```

The code was only stripping the `"girls/"` prefix:
```typescript
// WRONG - only strips "girls/" prefix, not repo GUID prefix
let newLoca = newAddress;
if (newAddress.startsWith("girls/")) {
  newLoca = newAddress.substring(6);
}
```

But the address from `PostParentItem` response is a **numeric address** (not a named path), so it starts with the repo GUID, not "girls/". This meant `newLoca` still contained the full address including the repo GUID.

When `putStatusContent(newLoca, body)` was called, it internally calls:
```typescript
invokeContentProvider([
  "IRepoService",
  "IItemWorker",
  "Put",
  SHARED_REPO_ID,  // repo GUID
  loca,            // full address including repo GUID!
  ...
]);
```

This resulted in the API receiving:
- `repo = "21d11bdc-f1f4-44d1-b61a-3fa6b039c641"`
- `loca = "21d11bdc-f1f4-44d1-b61a-3fa6b039c641/03/06/89/03"`

Which created the duplicate GUID in the path.

## Fix

### 1. Added `stripRepoPrefix` helper function in cli.ts

```typescript
/**
 * Strips the repo GUID prefix from a full address to get the numeric loca.
 * Example: "21d11bdc-f1f4-44d1-b61a-3fa6b039c641/03/06/89/03" -> "03/06/89/03"
 */
function stripRepoPrefix(address: string): string {
  if (!address) return "";
  const slashIndex = address.indexOf("/");
  if (slashIndex === -1) return address;
  return address.substring(slashIndex + 1);
}
```

### 2. Updated status creation flows in cli.ts

All places that previously used the incorrect "girls/" prefix stripping now use `stripRepoPrefix`:

**Location 1: Option 3 "Statuses Setup" → "Utwórz brakujące itemy `status`"**
**Location 2: Option 4 "Statuses Update" → Create status for missing lead**
**Location 3: Option 4 "Statuses Update" → Edit existing status**

```typescript
// Before (WRONG):
let newLoca = newAddress;
if (newAddress.startsWith("girls/")) {
  newLoca = newAddress.substring(6);
}

// After (CORRECT):
const newLoca = stripRepoPrefix(newAddress);
```

### 3. Added validation in chad-dba/src/leads.ts

Added a guard in `putStatusContent()` to detect and reject loca values that contain the repo GUID:

```typescript
export async function putStatusContent(loca: string, body: string): Promise<any> {
  // Validation: Ensure loca does not contain repo GUID
  // repoGuid should ONLY be passed as the repo argument, never in loca
  if (loca.includes(SHARED_REPO_ID)) {
    throw new Error(
      `Invalid loca for putStatusContent: loca contains repo GUID. ` +
      `repoGuid should only be passed as the repo argument, never in loca. ` +
      `Function: putStatusContent, repo: ${SHARED_REPO_ID}, loca: ${loca}`
    );
  }
  // ... rest of function
}
```

## Core Principle

**repoGuid must ONLY be passed as the `repo` argument, NEVER in `loca`.**

Correct model:
- `repo` = `21d11bdc-f1f4-44d1-b61a-3fa6b039c641`
- `loca` = `03/06/89/03`

Incorrect model:
- `repo` = `21d11bdc-f1f4-44d1-b61a-3fa6b039c641`
- `loca` = `21d11bdc-f1f4-44d1-b61a-3fa6b039c641/03/06/89/03`

## Related Files

- `../chad-console/src/cli.ts` - Status creation and editing flows
- `../chad-dba/src/leads.ts` - `putStatusContent()` function with validation
- `../chad-dba/src/beeper.ts` - `parseAddressToRepoLoca()` for address parsing