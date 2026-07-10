# Bug: Duplicate Repo GUID in Path (repoGuid/repoGuid)

## Description

A bug was discovered where some code was creating an item/folder with the same name as the repository GUID, resulting in an incorrect path structure like:

```
21d11bdc-f1f4-44d1-b61a-3fa6b039c641/21d11bdc-f1f4-44d1-b61a-3fa6b039c641/...
```

This caused the error:
```
Missing required config key: 'name'
```

because the backend tried to read this incorrectly created item as a normal item.

## Root Cause

The `postItemByNames` function in `src/leads.ts` did not have validation to prevent creating items with names that match the repository GUID. If code accidentally passed the repo GUID as part of the path names, it would create this invalid structure.

## Fix Applied

### 1. Protection in `postItemByNames` (src/leads.ts)

Added validation at the start of the function to check if any name in the path equals the repoId:

```typescript
// Protection: Check if any name in the path equals the repoId
// This prevents creating items like "21d11bdc-f1f4-44d1-b61a-3fa6b039c641/21d11bdc-f1f4-44d1-b61a-3fa6b039c641"
// which would cause "Missing required config key: 'name'" errors
for (const name of names) {
  if (name === repoId) {
    throw new Error(
      `Invalid path: Cannot create item with name "${name}" because it equals the repoId. ` +
      `This would create an invalid path structure. Check your path names - the repoId should only be used as the repository identifier, not as a folder/item name.`
    );
  }
}
```

### 2. Detection in `parseAddressToRepoLoca` (src/beeper.ts)

Added detection to identify when an address already contains the duplicate GUID pattern:

```typescript
// Protection: Detect if loca starts with a GUID pattern (duplicate repoId in path)
// This indicates a bug where an item was created with the repoId as its name,
// resulting in paths like "21d11bdc-f1f4-44d1-b61a-3fa6b039c641/21d11bdc-f1f4-44d1-b61a-3fa6b039c641/..."
const guidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
if (guidPattern.test(loca)) {
  throw new Error(
    `Invalid address structure: loca starts with a GUID pattern. ` +
    `This indicates a duplicate repoId in the path (e.g., "repoId/repoId/..."). ` +
    `Address: "${address}". ` +
    `This is likely caused by creating an item with a name equal to the repoId. ` +
    `Please check the code that created this item.`
  );
}
```

## Expected Behavior After Fix

1. **Prevention**: Any attempt to create an item with a name equal to the repo GUID will throw a clear error message explaining the issue.

2. **Detection**: Any attempt to parse an address that already contains the duplicate pattern will throw an error indicating the malformed path.

3. **Correct Paths**: All paths should follow the structure:
   ```
   repoGuid/folder1/folder2/item
   ```
   Where `folder1`, `folder2`, and `item` are NEVER equal to `repoGuid`.

## Examples of Correct Usage

```typescript
// Correct: Using normal folder names
await postItemByNames(SHARED_REPO_ID, ["beeper", "whatsup", "Alice", "beeper"]);
// Result: 21d11bdc-f1f4-44d1-b61a-3fa6b039c641/03/06/71/02/01

// Correct: Creating status for lead
await createStatusForLead("03/06/79");
// Result: 21d11bdc-f1f4-44d1-b61a-3fa6b039c641/03/06/79/02/status
```

## Examples of Blocked Usage

```typescript
// BLOCKED: Will throw error
await postItemByNames(SHARED_REPO_ID, ["21d11bdc-f1f4-44d1-b61a-3fa6b039c641", "folder"]);
// Error: Invalid path: Cannot create item with name "21d11bdc-f1f4-44d1-b61a-3fa6b039c641" because it equals the repoId.

// BLOCKED: Will throw error when parsing
parseAddressToRepoLoca("21d11bdc-f1f4-44d1-b61a-3fa6b039c641/21d11bdc-f1f4-44d1-b61a-3fa6b039c641/folder");
// Error: Invalid address structure: loca starts with a GUID pattern...
```

## Cleanup

If any incorrectly created items exist in the repository with the duplicate GUID pattern, they should be manually deleted from the Content Provider storage. Search for files/directories with the pattern:
```
21d11bdc-f1f4-44d1-b61a-3fa6b039c641/21d11bdc-f1f4-44d1-b61a-3fa6b039c641
```

## Related Files

- `../chad-dba/src/leads.ts` - `postItemByNames` function
- `../chad-dba/src/beeper.ts` - `parseAddressToRepoLoca` function
- `../chad-dba/src/path-resolver.ts` - Path resolution functions