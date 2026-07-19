# Login Fix Summary - Personal Dashboard

## Problem
Login failed with error: "Content Provider API is unavailable. Cannot authenticate."

Backend error: `Failed to read parameter "string[] args" from the request body as JSON.`

## Root Cause
**Two issues found:**

### Issue 1: Request Body Format Mismatch
- **Frontend sent:** `{ "args": ["IRepoService", "IItemWorker", "GetByNames", "root", "users", "users-list"] }`
- **Backend expected:** `["IRepoService", "IItemWorker", "GetByNames", "root", "users", "users-list"]`

The frontend was wrapping the args array in an object `{ args: [...] }`, but the backend's `/invoke` endpoint expects a raw JSON array `string[]`.

### Issue 2: Response Format Mismatch
- **Frontend expected:** `{ "success": true, "result": "..." }`
- **Backend returned:** `{ "Body": "...", "Settings": {...} }`

The frontend was checking for `data.success` which doesn't exist in the backend response, causing it to throw "Unknown error from Content Provider API".

## Solution

### Fix 1: Request Body Format (4 files)
Changed all `/invoke` calls to send raw `string[]` instead of `{ args: [...] }`:

1. **`content-provider/front_nextjs/src/lib/api.ts`** - `invokeStringArgs()` function
2. **`lib/user-service.ts`** - `invokeSharp()` function (used by login page)
3. **`app/api/flow/cp-flow.ts`** - `invokeCp()` function
4. **`lib/form-storage.ts`** - `invokeContentProvider()` function

```typescript
// Before:
body: JSON.stringify({ args }),

// After:
body: JSON.stringify(args),
```

### Fix 2: Response Parsing (2 files)
Updated response handling to accept `{ Body, Settings }` format from backend:

1. **`lib/user-service.ts`** - `invokeSharp()` function
2. **`lib/form-storage.ts`** - `invokeContentProvider()` function

```typescript
// Now handles both formats:
// 1. { Body, Settings } - direct response from backend
// 2. { success, result } - wrapped response format

if (data.Body !== undefined || data.Settings !== undefined) {
  // Backend returned { Body, Settings } directly
  return JSON.stringify(data);
}

if (data.success !== undefined) {
  // Backend returned { success, result } format
  if (!data.success) {
    throw new Error(`Content Provider API error: ${data.error?.message}`);
  }
  return data.result || '';
}
```

## Testing
The fix ensures that when the login page calls `getByNames("root", "users", "users-list")`, the request body will be:

```json
["IRepoService","IItemWorker","GetByNames","root","users","users-list"]
```

This matches the backend's expected format: `string[] args`

## Backend (Unchanged)
The backend `/invoke` endpoint (line 176 in `DefaultPreparer.cs`):
```csharp
webApp.MapPost("/invoke", (string[] args) => { ... })
```

This expects a raw JSON array, which the frontend now correctly provides.

## Expected Behavior After Fix
1. ✅ Users list loads successfully
2. ✅ "Content Provider API is unavailable" error disappears
3. ✅ Login works correctly
4. ✅ `users-list` item is fetched from Content Provider

## Files Modified
All files that send requests to `/invoke` endpoint were updated to send raw `string[]` instead of `{ args: [...] }`:

1. **`content-provider/front_nextjs/src/lib/api.ts`** - Fixed `invokeStringArgs()` function
2. **`lib/user-service.ts`** - Fixed `invokeSharp()` function (used by login page)
3. **`app/api/flow/cp-flow.ts`** - Fixed `invokeCp()` function
4. **`lib/form-storage.ts`** - Fixed `invokeContentProvider()` function

## Files NOT Modified (as per requirements)
- Backend C# code (`content-provider/api_charp/`) - Not allowed to modify
- Backend remains unchanged and expects raw `string[]`

## Summary of Changes
In all 4 files, the change was the same:

```typescript
// Before:
body: JSON.stringify({ args }),

// After:
body: JSON.stringify(args),
```

This ensures the request body is a raw JSON array `["arg1", "arg2", ...]` instead of an object `{ "args": ["arg1", "arg2", ...] }`.
