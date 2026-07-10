# Bug: Status Created But Not Detected

## Status
Identified and fixed.

## Context
- **Projects affected:** `chad-console`, `chad-dba`
- **Feature:** Status detection in `loadStatusesContext()`
- **Date identified:** 2026-07-07

## Symptom

When creating a status for lead `26-07-06_pn_Karolina_ruda` (girlId: `89`), the status is successfully created and saved:

```
[DEBUG] PostParentItem: repo=21d11bdc-f1f4-44d1-b61a-3fa6b039c641, loca=03/06/89, type=Text, name=status
created + initialized: 03/06/89/03 for 26-07-06_pn_Karolina_ruda
```

However, when the application loads statuses via `chad_GetLeadsStatuses()`, the newly created status is not detected. The lead continues to show as `[brak statusu]` even after restarting the application.

## Root Cause

The bug is in the `loadStatusesContext()` function in `../chad-console/src/cli.ts` (around line 652-666).

### The Problematic Code (Before Fix)

```typescript
// Build map of girlIds that have statuses
// Status address format: girls/06/80/03 -> girlId is "80" (third segment)
const girlsWithStatusesMap = new Map<string, { address: string; item: any }>();
if (Array.isArray(statusItems)) {
  statusItems.forEach((item) => {
    const address = item?.Settings?.address || "";
    if (address) {
      const parts = address.split("/");
      // girls/06/80/03 -> parts: ["girls", "06", "80", "03"]
      // girlId is at index 2
      if (parts.length >= 3) {
        const girlId = parts[2];
        girlsWithStatusesMap.set(girlId, { address, item });
      }
    }
  });
}
```

### Why This Fails

The comment assumes the address format is `girls/06/80/03`, but the **actual address format** returned by the Content Provider is in **numeric format**:

```
21d11bdc-f1f4-44d1-b61a-3fa6b039c641/03/06/89/03
```

When split by `/`:
- Parts: `["21d11bdc-f1f4-44d1-b61a-3fa6b039c641", "03", "06", "89", "03"]`
- `parts[2]` = `"06"` ← **WRONG!** This is the numeric segment for leads folder, not the girlId!

The correct girlId (`89`) is at `parts[3]`, not `parts[2]`.

### The Correct Approach

The status loca format is: `{leadsBaseLoca}/{girlId}/{statusItemNumber}`

For example: `03/06/89/03` where:
- `03/06` is the leads base loca (resolved dynamically via `chad_GetLeadsLoca()`)
- `89` is the girlId
- `03` is the status item number within the girl's folder

To correctly extract girlId:
1. Strip the repo GUID prefix from the address to get numeric loca
2. Strip the leads base loca prefix from the numeric loca
3. Take the first segment of the remaining path (which is the girlId)

### The Fix

```typescript
// Build map of girlIds that have statuses
// IMPORTANT: The status address is in numeric format (e.g., "repo/03/06/89/03")
// We need to extract the girlId from the leads Body map, not from address segments.
// 
// The status loca format is: {leadsBaseLoca}/{girlId}/{statusItemNumber}
// For example: "03/06/89/03" where:
//   - "03/06" is the leads base loca
//   - "89" is the girlId
//   - "03" is the status item number within the girl's folder
//
// To extract girlId, we need to:
// 1. Get the leads base loca (e.g., "03/06")
// 2. Strip that prefix from the status loca
// 3. Take the first segment of the remaining path (which is the girlId)

const girlsWithStatusesMap = new Map<string, { address: string; item: any }>();
if (Array.isArray(statusItems)) {
  // Get leads base loca to properly extract girlId from status addresses
  const leadsBaseLoca = await chad_GetLeadsLoca();
  
  statusItems.forEach((item) => {
    const address = item?.Settings?.address || "";
    if (address) {
      // Strip repo GUID prefix to get numeric loca
      const loca = stripRepoPrefix(address);
      
      // Extract girlId from loca by:
      // 1. Stripping the leads base loca prefix
      // 2. Taking the first segment of the remainder
      let girlId: string | null = null;
      if (loca.startsWith(leadsBaseLoca + '/')) {
        const relativeLoca = loca.substring(leadsBaseLoca.length + 1);
        const segments = relativeLoca.split('/');
        if (segments.length >= 1) {
          girlId = segments[0];
        }
      }
      
      if (girlId) {
        girlsWithStatusesMap.set(girlId, { address, item });
      }
    }
  });
}
```

## Key Principle: Never Assume Address Format

This bug highlights a critical principle:

**The address format returned by Content Provider is NOT guaranteed to use human-readable names.** The system may return:
- Numeric loca paths: `repo/03/06/89/03`
- Name-based paths: `girls/06/80/03` (less common in API responses)

Always:
1. **Check the actual format** by logging/debugging before making assumptions
2. **Use resolver functions** like `chad_GetLeadsLoca()` to get the base path dynamically
3. **Strip prefixes correctly** based on the actual data format, not assumed format

## Related Bugs

- [status-creation-uses-incomplete-loca.md](status-creation-uses-incomplete-loca.md) - Similar issue where hardcoded path segments caused status creation to fail

## Impact

- All newly created statuses were invisible to the application
- Users could not see their newly created statuses in the "Statuses Update" view
- The status physically existed in the repository but was never matched to the correct lead

## Files Modified

- `../chad-console/src/cli.ts` - Fixed the `loadStatusesContext()` function to correctly extract girlId from status addresses