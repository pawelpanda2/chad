# Bug: Status Save Used Logical `status` As Loca Segment

## Status
Identified and fixed.

## Context
- **Project affected:** `dashboard`
- **Shared module involved:** `chad-dba`
- **Feature:** Status editor save flow
- **Date identified:** 2026-07-07

## Symptom

Saving status changes from Dashboard for lead `26-05-29_wf_Paulina_Heller` (`leadKey: 81`) could create an illegal physical folder:

```text
/Users/pawelfluder/Dropbox/repos/21d11bdc-f1f4-44d1-b61a-3fa6b039c641/03/06/81/status/
```

This must never happen.

In Content Provider repositories, child folders of an item must be numeric only, for example:

```text
01
02
03
001
002
```

The logical name `status` may exist only in `config.yaml` as `name: status`, not as a folder name.

## What Happened

Dashboard status save used a two-step flow:

1. `POST /api/statuses/edit` with `createDefault: true`
2. `POST /api/statuses/edit` with edited fields

The first request succeeded and created the illegal `status/` folder.
The second request failed because the backend validator then detected that non-numeric child folder.

## Root Cause

The bug was in shared logic inside `chad-dba`, used by Dashboard.

### Problem 1: Wrong Status Address Model

`chad-dba` treated status as if its item loca were:

```text
03/06/81/status
```

That is wrong.

The correct model is:

- parent lead loca: `03/06/81`
- logical child name: `status`
- real status item loca: numeric child, for example `03/06/81/01`

### Problem 2: Existing Status Was Not Resolved By Name

There was already a valid existing item:

```text
03/06/81/01
```

with config:

```yaml
name: status
type: Text
```

But Dashboard logic did not resolve that child by logical name.
Instead it tried to access `03/06/81/status` directly.

### Problem 3: Save Path Used Invalid `loca`

Before the fix, `chad-dba/src/statuses-dashboard.ts` constructed:

```ts
const statusLoca = `${leadsBaseLoca}/${leadKey}/status`;
```

and then used that value in both read and write paths.

That made the save flow behave as if `status` were a physical folder segment instead of a logical item name.

## Why It Was Possible

The backend had two different write paths:

- `PostParentItem(repo, parentLoca, type, name)`
- `Put(repo, itemLoca, type, name, body)`

`PostParentItem` is the correct operation for:

- create or get child by logical name under a numeric parent

`Put` is the correct operation for:

- update an already resolved item at a numeric loca

The bug happened because the frontend/shared layer mixed these concepts:

- it created or searched logical child `status`
- but later treated `status` as if it were part of the numeric `loca`

That is how `03/06/81/status` became possible.

## Files Involved

### Dashboard caller

- `chad-dashbord/app/(dashboard)/dashboard/statuses/page.tsx`
- `chad-dashbord/app/api/statuses/edit/route.ts`

### Shared logic with the bug

- `chad-dba/src/statuses-dashboard.ts`
- `chad-dba/src/leads.ts`

## Fix Implemented

The fix was implemented in `chad-dba`, so it applies to both Dashboard and any other consumer using the same shared status helpers.

### 1. Resolve Existing Status By Logical Name

Added shared helper logic that:

- finds status item by logical name `status`
- reads its real `Settings.address`
- converts that address to numeric loca

Example:

```text
21d11bdc-f1f4-44d1-b61a-3fa6b039c641/03/06/81/01
-> 03/06/81/01
```

### 2. Save Uses Real Numeric Status Loca

After the fix, save no longer writes to:

```text
03/06/81/status
```

It writes to the resolved numeric item loca, for example:

```text
03/06/81/01
```

### 3. Create Uses `PostParentItem`, Save Uses Resolved Numeric `Put`

Correct sequence is now:

1. resolve existing status under lead by logical name `status`
2. if missing, create it with `PostParentItem(repo, leadLoca, "Text", "status")`
3. read returned address
4. strip repo prefix
5. `Put(...)` only to numeric loca returned by backend

## Result After Fix

For lead `81`, runtime validation showed:

```text
statusLoca: 03/06/81/01
statusCategory: valid
```

Saving updated the body in:

```text
03/06/81/01/body.txt
```

and did not create:

```text
03/06/81/status/
```

## Key Rule

Never build item loca by appending logical item names like `status`.

Correct rule:

- logical names are for `PostParentItem` and lookup by name
- physical save targets must always use resolved numeric loca returned by Content Provider

## Related Documentation

- `architecture/bugs/status-created-but-not-detected.md`
- `architecture/chad-dba/bugs/status-creation-uses-incomplete-loca.md`