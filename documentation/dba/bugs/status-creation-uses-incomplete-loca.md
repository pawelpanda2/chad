# Bug: Status Creation Uses Incomplete Loca Path

## Status
Identified and fixed.

## Context
- **Projects affected:** `chad-console`, `chad-dba`
- **Feature:** Status creation for leads via `PostParentItem`
- **Date identified:** 2026-07-06

## Symptom

When creating a status for item `26-07-06_pn_Karolina_ruda` (girlId: `89`), the script/API attempted to create the status under location `06/89` instead of the correct full location `03/06/89`.

### Error Log
```
PostParentItem(repo, "06/89", "Text", "status")
failed: 06/89/status for 26-07-06_pn_Karolina_ruda
Could not find a part of the path '/Users/pawelfluder/Dropbox/repos/21d11bdc-f1f4-44d1-b61a-3fa6b039c641/06/89'.
```

### Expected Behavior
```
PostParentItem(repo, "03/06/89", "Text", "status")
```

## Root Cause

In `../chad-console/src/cli.ts` at line 1004, the `girlLoca` was hardcoded as:

```typescript
const girlLoca = `06/${girl.id}`;
```

This constructs only a partial path (`06/89`) instead of the full numeric loca (`03/06/89`).

### Why This Happened - The Deeper Issue

The bug is not just about missing `03/` - it's about treating a **dynamic repository value** as if it were a **stable constant**.

**Critical Principle:** The numeric segments in loca paths (like `06`) are **NOT constants**. They are:
- Assigned by the repository system when items are created
- Can vary between different repository instances
- Can change if the repository structure is reorganized
- Must be resolved dynamically from the actual repository data

In this case, `06` happens to be the current numeric segment for the `leads` folder, but:
- It could be `07` or `05` in a different repository
- It could change if items are reordered or reorganized
- It must NEVER be hardcoded in application code

### The Correct Approach

1. **Always resolve paths dynamically** using `chad_GetLeadsLoca()` which queries the repository
2. **Store the full loca** when loading items into memory
3. **Use the stored full loca** for all subsequent operations (POST, PUT, GET)
4. **Never assume** any numeric segment is stable or predictable

## Principle: Never Hardcode or Truncate Loca

**Critical Rule:** Loca paths are **dynamic repository data**, not application constants.

### What NOT to do:
- ❌ Hardcode any numeric segment: `06/89`, `03/06/89`, etc.
- ❌ Assume `leads` always starts with `06` (it could be `07`, `05`, etc.)
- ❌ Use partial paths from memory - always use the full path from the repository
- ❌ Treat numeric segments as stable - they can change between repo instances

### What TO do:
- ✅ Always resolve paths dynamically using `chad_GetLeadsLoca()` or similar
- ✅ When loading items, store their **full loca** (e.g., `03/06/89`)
- ✅ Use the stored full loca for all subsequent operations
- ✅ Query the repository for current paths, don't assume them

### Examples:
- ❌ Wrong: `const girlLoca = "06/89";` (hardcoded, assumes 06 is stable)
- ❌ Wrong: `const girlLoca = "03/06/89";` (hardcoded, assumes 03/06 is stable)
- ✅ Correct: `const leadsLoca = await chad_GetLeadsLoca(); const girlLoca = `${leadsLoca}/89`;`
- ✅ Correct: Store `item.Settings.address` (full path) when loading, use it later

## Impact

- Status creation fails with `DirectoryNotFoundException` because the path `06/89` doesn't exist
- The correct path `03/06/89` exists as part of the leads hierarchy

## Fix

### Code Change in `../chad-console/src/cli.ts`

**Before (line 1004):**
```typescript
const girlLoca = `06/${girl.id}`;
```

**After:**
```typescript
// Get the full leads base loca (e.g., "03/06") and append girl's id
const leadsBaseLoca = await chad_GetLeadsLoca();
const girlLoca = `${leadsBaseLoca}/${girl.id}`;
```

### Diagnostic Safeguard Added

Before calling `PostParentItem`, log the full parameters and validate the loca:

```typescript
console.log(`[DEBUG] PostParentItem args: repo=${SHARED_REPO_ID}, loca=${girlLoca}, type=Text, name=status`);

// Validate loca looks like a full path (should have at least 2 segments for leads: "XX/YY/girlId")
const locaSegments = girlLoca.split('/');
if (locaSegments.length < 3) {
    throw new Error(`Invalid loca "${girlLoca}": expected at least 3 segments (e.g., "03/06/89"), got ${locaSegments.length}`);
}
```

## Related Files

- `../chad-console/src/cli.ts` - Contains the status creation logic (line ~1004)
- `src/leads.ts` - Contains `createStatusForLead()` function that calls `PostParentItem`
- `src/path-resolver.ts` - Contains `chad_GetLeadsLoca()` for resolving the leads base path

## Prevention

1. Always use `chad_GetLeadsLoca()` or similar resolver functions to get the full base path
2. Never hardcode path segments that may vary between repositories or change over time
3. Add validation before write operations to ensure the loca has the expected structure
4. Log full parameters before API calls for easier debugging