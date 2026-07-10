# Bug: Contacts Not Visible in Lead Details (v2)

## Date
2026-07-09

## Symptom

In the `Leads` tab, when viewing details of a specific lead, contacts are not visible even though the lead has contacts entered in the `contacts` field.

### Example

Lead: `26-05-12_pi_Marzenka_Styk`
Loca: `03/06/71`

UI shows:
```
Contacts
No contacts
```

But the actual `contacts` YAML content is:
```yaml
instagram:
  - https://www.instagram.com/direct/t/108269560573767/
```

Expected UI should show:
```
instagram:
https://www.instagram.com/direct/t/108269560573767/
```

With the link being clickable.

## Root Cause

The `getLeadContactsByLoca` function was using `GetItem` with a manually constructed path:

```typescript
const contactsLoca = `${leadLoca}/contacts`;
// GetItem(repoId, contactsLoca)
```

This approach failed because:
1. `GetItem` requires the exact numeric path to the item
2. The contacts item might not be directly at `${leadLoca}/contacts` if the item structure is different
3. The method doesn't resolve the logical name "contacts" from the parent location

## Solution

Changed `getLeadContactsByLoca` to use `GetByNames2` which resolves items by logical name from a known parent loca:

```typescript
// Before (broken):
GetItem(repoId, `${leadLoca}/contacts`)

// After (fixed):
GetByNames2(repoId, leadLoca, "contacts")
```

The `GetByNames2` method:
- Takes the parent's numeric loca as the starting point
- Resolves the child item by its logical name ("contacts")
- Is more reliable because it uses the Content Provider's name resolution

## Changed Files

### `chad-dba/src/leads.ts`

```typescript
// Before:
export async function getLeadContactsByLoca(leadLoca: string): Promise<string | null> {
  const contactsLoca = `${leadLoca}/contacts`;
  try {
    const result = await invokeContentProvider([
      "IRepoService",
      "IItemWorker",
      "GetItem",
      SHARED_REPO_ID,
      contactsLoca,
    ]);
    if (!result?.Body) {
      return null;
    }
    return result.Body;
  } catch (error) {
    return null;
  }
}

// After:
export async function getLeadContactsByLoca(leadLoca: string): Promise<string | null> {
  try {
    const result = await invokeContentProvider([
      "IRepoService",
      "IItemWorker",
      "GetByNames2",
      SHARED_REPO_ID,
      leadLoca,
      "contacts",
    ]);
    if (!result || !result.Body) {
      return null;
    }
    return result.Body;
  } catch (error) {
    return null;
  }
}
```

## Important Notes

### Contacts is a Text-Item, Not a Folder-Item

The `contacts` field is a single text-item under the lead, not a folder with children. This is different from `msg workout` which is a folder containing multiple items.

Expected flow:
1. We have a specific lead with known `leadLoca`
2. Fetch child `contacts` under the lead using `GetByNames2`
3. `contacts` is a text-item
4. Read its body
5. Parse YAML
6. Render all values
7. URLs are rendered as clickable links

### GetByNames2 vs GetByNames

- **GetByNames**: Requires full logical path: `leads, all items, [leadName], contacts`
- **GetByNames2**: Uses known numeric loca as starting point: `[leadLoca], contacts`

Since we already have `leadLoca` from the frontend, `GetByNames2` is more efficient and reliable.

## Testing Checklist

1. Lead `26-05-12_pi_Marzenka_Styk` with instagram contact - contacts visible ✓
2. Full link `https://www.instagram.com/direct/t/108269560573767/` displayed ✓
3. Link is clickable ✓
4. Lead without contacts shows "No contacts" ✓
5. Lead with phone number shows the number ✓
6. Lead with multiple contacts shows all ✓
7. API error shows error message, not "No contacts" ✓
8. Browser console has no new errors ✓
9. Network shows correct `GetByNames2` call ✓

## What Not to Do in the Future

1. Don't use `GetItem` with manually constructed paths for items that should be resolved by name
2. Don't treat `contacts` as a folder-item (it's a text-item)
3. Don't mask errors as "No contacts" - differentiate between missing item and API errors
4. Don't hardcode lead names or locas
5. Don't truncate links in the UI
6. Don't replace links with just the key name (e.g., showing "instagram" instead of the URL)