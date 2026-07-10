# Bug: Lead Details Page Header Shows Incorrect Format

## Status

**Fixed** - 2026-07-08

## Symptom

When opening a lead's details page, the header card displayed the lead name and ID incorrectly:

**Before fix:**
```
26-07-06_pn_Karolina_ruda

ID: 03
```

**Issues:**
1. Name and ID were on separate lines
2. "ID:" label was shown (not requested by user)
3. Numeric address (loca) was not displayed

## Expected Behavior

The header should show the lead name and numeric address (loca) on one line, separated by a dot (·), matching the format used in the Todo Messages page:

```
26-07-06_pn_Karolina_ruda · 03/06/62/02/04
```

## Root Cause

The lead details page header was implemented with:
1. Lead name in one div
2. "ID: {leadKey}" in a separate div below

This didn't match the established pattern used in other pages (like Todo Messages) where the loca is displayed inline with a dot separator.

## Fix Applied

Changed the header from:
```tsx
<div className="flex items-center gap-2">
  <h1 className="text-base font-semibold leading-tight truncate">{details.leadName}</h1>
</div>
<div className="mt-0.5 text-xs text-muted-foreground">
  ID: {details.leadKey}
</div>
```

To:
```tsx
<div className="flex items-center gap-2">
  <h1 className="text-base font-semibold leading-tight truncate">{details.leadName}</h1>
  {details.loca && (
    <>
      <span className="text-muted-foreground flex-shrink-0">·</span>
      <span className="text-xs text-muted-foreground truncate">{details.loca}</span>
    </>
  )}
</div>
```

## Changes Made

- Removed the separate "ID:" line
- Added loca display inline with the name
- Used dot separator (·) matching the Todo Messages page pattern
- Made loca display conditional (only shows if loca exists)

## Files Involved

- `chad-dashbord/app/(dashboard)/dashboard/leads/details/page.tsx`

## Reference

The format matches the Todo Messages page (`app/(dashboard)/dashboard/todo-msg/page.tsx`):
```tsx
{lead.loca && (
  <>
    <span className="text-muted-foreground flex-shrink-0">·</span>
    <span className="text-xs text-muted-foreground truncate">{lead.loca}</span>
  </>
)}