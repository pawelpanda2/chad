# Bug: Msg Todo "Your First Msg" Missing Path/Loca Display

## Status
**Fixed** - 2026-07-08

## Context
- **Projects affected:** `chad-dba`, `chad-dashbord`
- **Feature:** Todo Msg dashboard list view, Msg Planner content generation
- **Date identified:** 2026-07-08
- **Date fixed:** 2026-07-08

## Symptom

### Bug 1: Msg Todo UI - Missing Path for "Your First Msg"

When selecting the "Your First Msg" filter in the Msg Todo dashboard, the path/address (loca) was not displayed for lead items.

**Before (incorrect):**
```
66.
26-05-11_pn_Daria
```

**After (correct):**
```
66.
26-05-11_pn_Daria
info · 03/06/66
```

### Bug 2: Msg Planner - Missing Full Loca in Generated Content

When creating a new Msg Planner plan, the "Your first msg" section was generating entries with only the lead ID instead of the full loca path.

**Before (incorrect):**
```
//with; Your first msg
	66; 26-05-11_pn_Daria
	68; 26-05-12_pn_Laura
```

**After (correct):**
```
//sorted
	//1; obowiązkowo nowe
	//2; obowiązkowo gorący lead
	//3; wypadałoby
	//3; fajnie by było
	//4; koleżaki

//with; Todo
	03/06/62/02/04; 26-05-11_pn_Luba

//with; Your first msg
	03/06/66; 26-05-11_pn_Daria
	03/06/68; 26-05-12_pn_Laura
```

## Root Cause

The `getFirstMsgLeads()` function in `src/leads.ts` was not returning the `loca` field in its result objects. The function only returned `leadKey`, `leadName`, and `valid`, but not `loca`.

In contrast, `getTodoMsgLeads()` correctly returned the `loca` field from the todo item's address.

## Fix

Modified `getFirstMsgLeads()` in `src/leads.ts` to construct and return the full `loca` field:

```typescript
// Step 4: Build results for leads with your-first-message: true
const results: TodoMsgResult[] = Array.from(girlsWithFirstMsgTrue).map((girlId) => {
  const leadName = leadsNameMap.get(girlId);
  // Construct full loca from base loca + leadKey
  const loca = leadsBaseLoca ? `${leadsBaseLoca}/${girlId}` : "";
  return {
    leadKey: girlId,
    leadName: leadName || `[missing lead: ${girlId}]`,
    loca,  // <-- Added this field
    valid: !!leadName,
  };
});
```

Also updated `generatePlanContent()` to use the `loca` field directly from the lead data instead of constructing it again:

```typescript
// Build entries for Your first msg section - use loca directly from the lead data
const firstMsgEntries: PlanContentEntry[] = firstMsgLeads
  .filter(lead => lead.valid && lead.loca)
  .map(lead => ({
    address: lead.loca!,
    leadName: lead.leadName,
  }));
```

## Files Modified

1. `src/leads.ts` - Added `loca` field to `getFirstMsgLeads()` return value and simplified `generatePlanContent()` to use it directly

## Testing

1. Go to Msg Todo dashboard
2. Select "Todo" filter - verify items show full path (e.g., `03/06/62/02/04`)
3. Select "Your First Msg" filter - verify items now show full path (e.g., `03/06/66`)
4. Go to Msg Planner
5. Click "new" to create a new plan
6. Verify generated content has full loca in "Your first msg" section (e.g., `03/06/66; 26-05-11_pn_Daria`)

## Architectural Notes

This fix ensures both `getTodoMsgLeads()` and `getFirstMsgLeads()` return a consistent data model with the `loca` field:

```typescript
export interface TodoMsgResult {
  leadKey: string;
  leadName: string;
  loca?: string;  // Full numeric path (e.g., "03/06/66")
  valid: boolean;
}
```

Both the Msg Todo UI and Msg Planner content generator now use this same field, ensuring consistency across the application.