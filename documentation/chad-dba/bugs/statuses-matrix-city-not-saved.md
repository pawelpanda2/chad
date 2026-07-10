# Bug: Statuses Matrix - City Changes Not Persisted After Save

## Status

**Fixed** - 2026-07-08

## Symptom

In the Statuses page, Matrix mode, when editing the `city` field for a lead and clicking the per-row save button:
1. UI shows "saved" indicator briefly
2. After page refresh, the city value reverts to the previous value (or empty)
3. Data is NOT persisted to Content Provider

## Root Cause

The bug was in the API route `/api/statuses/edit` in `chad-dashbord`. The route was incorrectly using `parseStatusFields` to validate the incoming fields:

```typescript
// BROKEN CODE
const statusFields: StatusFields = parseStatusFields(JSON.stringify(fields));
```

### Why This Was Wrong

The `parseStatusFields` function (from `chad-dba/statuses-dashboard.ts`) expects a **YAML-formatted string** like:
```
city: Warszawa
only-friends: false
her-first-msg: true
```

But the API route was passing a **JSON string** like:
```json
{"city":"Warszawa","only-friends":false,"her-first-msg":true,...}
```

When `parseStatusFields` receives a JSON string, it calls `parseStatusBody` which tries to split by newlines and parse `key: value` patterns. The JSON format doesn't match this pattern, so all fields are parsed as empty/default values:
- `city` becomes `""`
- `only-friends` becomes `false`
- `her-first-msg` becomes `false`
- etc.

The `saveLeadStatus` function then correctly saves these empty/default values to the Content Provider, overwriting any existing data. The UI shows "saved" because the save operation technically succeeds - it just saves the wrong (empty) data.

### Flow Diagram

```
User enters "Warszawa" in city field
         ↓
Frontend sends POST /api/statuses/edit with body:
  { "leadKey": "89", "fields": { "city": "Warszawa", ... } }
         ↓
API route calls parseStatusFields(JSON.stringify(fields))
         ↓
parseStatusFields expects YAML but receives JSON
         ↓
parseStatusBody fails to extract fields from JSON
         ↓
Returns StatusFields with empty/default values:
  { "city": "", "only-friends": false, ... }
         ↓
saveLeadStatus saves empty values to Content Provider
         ↓
UI shows "saved" (operation succeeded, but wrong data saved)
         ↓
Page refresh shows empty city (because empty was saved)
```

## Incorrect Flow (Before Fix)

```typescript
// chad-dashbord/app/api/statuses/edit/route.ts - BROKEN
export async function POST(request: NextRequest) {
  // ...
  const statusFields: StatusFields = parseStatusFields(JSON.stringify(fields));
  // parseStatusFields expects YAML but receives JSON
  // Result: all fields are empty/default values
  
  await saveLeadStatus(leadKey, statusFields);
  // Saves empty values to Content Provider
}
```

## Correct Flow (After Fix)

The fix validates the fields object directly instead of trying to parse it as YAML:

```typescript
// chad-dashbord/app/api/statuses/edit/route.ts - FIXED
export async function POST(request: NextRequest) {
  // ...
  // Validate and construct StatusFields from the request body directly
  // The fields from the request are already in the correct format
  const statusFields: StatusFields = {
    city: String(fields.city ?? ""),
    "only-friends": Boolean(fields["only-friends"]),
    "her-first-msg": Boolean(fields["her-first-msg"]),
    "your-first-message": Boolean(fields["your-first-message"]),
    "writing-deadline": String(fields["writing-deadline"] ?? "2099-01-01"),
    "priority-today": Number(fields["priority-today"] ?? 0),
  };
  
  await saveLeadStatus(leadKey, statusFields);
  // Now saves the actual user values to Content Provider
}
```

## Key Architecture Principle

The correct pattern for saving items in Content Provider is:

1. **POST (create-or-get)**: Use `PostParentItem(repo, parentLoca, type, name)` to ensure the item exists
   - This is idempotent: same result whether item exists or not
   - Returns the item with `Settings.address` containing the real numeric loca

2. **PUT (save content)**: Use `Put(repo, loca, type, name, body)` with the resolved numeric loca
   - The `loca` must be the numeric path from `Settings.address`, NOT a path built from logical names

### Example

For a lead at `03/06/81`:
- Status item might be at `03/06/81/01` with `name: status` in config.yaml
- `PostParentItem(repo, "03/06/81", "Text", "status")` returns the item at `03/06/81/01`
- `Put(repo, "03/06/81/01", "Text", "status", body)` saves the content

## Files Involved

### Fixed in chad-dashbord
- `chad-dashbord/app/api/statuses/edit/route.ts` - API endpoint (root cause of bug)

### Used by (working correctly)
- `chad-dba/src/statuses-dashboard.ts` - `saveLeadStatus`, `parseStatusFields` functions
- `chad-dba/src/leads.ts` - `createStatusForLead`, `putStatusContent`, `getStatusLocaFromItem`
- `chad-dashbord/app/(dashboard)/dashboard/statuses/page.tsx` - Frontend Matrix mode

## Test Manualny (Manual Test)

1. Navigate to Statuses page in dashboard
2. Switch to Matrix mode
3. Find any lead with an existing status (or missing status)
4. Enter a city value, e.g., "Warszawa"
5. Click the save button in that row
6. Verify:
   - Button shows "saved" indicator
   - No error messages
7. Refresh the page
8. Verify the city value "Warszawa" is still present
9. Check Dev Panel / Requests tab for:
   - `PostParentItem` request for status creation/retrieval
   - `Put` request with correct args:
     - `repoGuid`: `21d11bdc-f1f4-44d1-b61a-3fa6b039c641`
     - `loca`: numeric path like `03/06/81/01` (NOT `03/06/81/status`)
     - `body`: contains `city: Warszawa`
10. Change city to different value, save again
11. Refresh and verify the new value persists

## Related Documentation

- `architecture/chad-dba/data-access.md` - Content Provider data access patterns
- `architecture/chad-dba/post-parent-item.md` - PostParentItem operation documentation
- `architecture/chad-dba/resolve-paths.md` - Path resolution principles
- `architecture/ai-docs/feature-documentation-rules.md` - Documentation standards
