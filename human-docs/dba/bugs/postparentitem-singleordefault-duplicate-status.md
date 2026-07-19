# Bug: InvalidOperationException - Sequence contains more than one matching element in PostParentItem

## Status: FIXED ✅

## Error Summary

```
InvalidOperationException: Sequence contains more than one matching element
```

**Location:** `ReadMultiWorker.GetItemBySequentialOneName()` at line 144

**Trigger:** Calling `IItemWorker.PostParentItem(repo, loca, type, name)` where the parent folder contains multiple items with the same name.

## Call Stack Analysis

```
ReadMultiWorker.GetItemBySequentialOneName() [line 144]
    ↓ throws exception
ReadMultiWorker.GetItemBySeqOfNames() [line 114]
    ↓ calls
WriteTextWorker.IfMineParentPost() [line 16]
    ↓ calls
WriteMultiWorker.PostItem() [line 48]
    ↓ calls
ItemWorker.PostParentItem() [line 18]
```

## Root Cause

### Primary Cause: Duplicate Item Names in Repository

The repository `21d11bdc-f1f4-44d1-b61a-3fa6b039c641` at location `03/06/87` contains **TWO items with the name "status"**:

| Path | GUID | Type | Name |
|------|------|------|------|
| `/03/06/87/status/` | `ff50cca8-29a2-4282-ad5c-cb84b1f6d83e` | Text | status |
| `/03/06/87/02/` | `ae9a1a7c-6eaf-4771-86b6-7007772561a5` | Text | status |

### Code Vulnerability

The `GetItemBySequentialOneName()` method uses `SingleOrDefault()` which throws when more than one element matches:

```csharp
// ReadMultiWorker.cs:142-145
List<ItemModel> items = _readMany.ListOfOnlyConfigItems(adrTuple);
foundItem = items.SingleOrDefault(x => x.Name.ToString() == name);
```

When searching for name "status" under parent `03/06/87`, the collection contains:
1. Item at `03/06/87/status/` with name="status"
2. Item at `03/06/87/02/` with name="status"

Both match the predicate `x.Name.ToString() == "status"`, causing `SingleOrDefault()` to throw.

## Affected Code Paths

The following locations use `SingleOrDefault()` on name-based lookups and are vulnerable to the same issue:

### 1. ReadMultiWorker.GetItemBySequentialOneName() [ACTIVE - CRASHING]
**File:** `SharpRepoService/Workers/CrudReads/ReadMultiWorker.cs:144`
```csharp
foundItem = items.SingleOrDefault(x => x.Name.ToString() == name);
```

### 2. ReadManyWorker.GetAdrTupleByName() [VULNERABLE]
**File:** `SharpRepoService/Workers/CrudReads/ReadManyWorker.cs:214`
```csharp
ItemModel found = items.SingleOrDefault(x => x.Name.ToString() == name);
```

### 3. ReadAddressWorker.GetAdrTupleByName() [VULNERABLE]
**File:** `SharpRepoService/Workers/CrudReads/ReadAddressWorker.cs:35-36`
```csharp
ItemModel found = items.SingleOrDefault(x => x.Name.ToString() == name);
```

## Data Analysis

### Repository Structure

```
21d11bdc-f1f4-44d1-b61a-3fa6b039c641/
└── 03/
    └── 06/
        └── 87/                          # "26-05-04_pi_Magda_Kamińska"
            ├── config.yaml              # Parent folder config
            ├── status/                  # ← DUPLICATE NAME #1
            │   └── config.yaml          # name: "status", type: "Text"
            ├── 01/
            │   └── config.yaml          # name: "contacts", type: "Text"
            └── 02/                      # ← DUPLICATE NAME #2
                └── config.yaml          # name: "status", type: "Text"
```

### Config File Contents

**Parent folder (`03/06/87/config.yaml`):**
```yaml
"id": "9812f904-0fbf-43bd-ac4d-457d284b7a78"
"type": "Folder"
"name": "26-05-04_pi_Magda_Kamińska"
"address": "21d11bdc-f1f4-44d1-b61a-3fa6b039c641/03/06/87"
```

**First "status" item (`03/06/87/status/config.yaml`):**
```yaml
"id": "ff50cca8-29a2-4282-ad5c-cb84b1f6d83e"
"type": "Text"
"name": "status"
"address": "21d11bdc-f1f4-44d1-b61a-3fa6b039c641/03/06/87/status"
```

**Second "status" item (`03/06/87/02/config.yaml`):**
```yaml
"id": "ae9a1a7c-6eaf-4771-86b6-7007772561a5"
"type": "Text"
"name": "status"
"address": "21d11bdc-f1f4-44d1-b61a-3fa6b039c641/03/06/87/02"
```

## Hypotheses for How This Occurred

### Hypothesis 1: Manual File System Manipulation (Most Likely)
Someone manually created a folder named "status" at `03/06/87/status/` without going through the proper API, which already had an item at `03/06/87/02/` with name="status".

### Hypothesis 2: Bug in Item Creation Logic
The `PostItem` or related functions may have a race condition or logic error that allows creating items with duplicate names under the same parent.

### Hypothesis 3: Migration/Import Issue
During a migration or import process, items may have been created with incorrect names that duplicate existing items.

## Why SingleOrDefault() is the Wrong Choice Here

The use of `SingleOrDefault()` assumes that:
1. There should be at most ONE item with a given name under a parent
2. If there are multiple, it's an exceptional error

However, the codebase has **no validation** to prevent duplicate names from being created, making this assumption unsafe.

## Root Cause Analysis

The fundamental issue is that **non-numeric folder names violate the repository structure**. In Content Provider, all Item folders must have numeric names (like `01`, `02`, etc.). The logical name (like "status") exists only in `config.yaml`. Having a physical folder named `status/` is repository corruption.

## Implemented Fix

### 1. Added Validation Method to ReadFolderWorker

Added `ValidateChildFoldersAreNumeric()` method that checks all child folders have numeric names:

```csharp
// In ReadFolderWorker.cs
public (bool IsValid, string InvalidFolderName) ValidateChildFoldersAreNumeric(
    (string Repo, string Loca) parentAdrTuple)
{
    string parentPath = _path.GetItemPath(parentAdrTuple);
    
    if (!Directory.Exists(parentPath))
    {
        return (true, null); // Parent doesn't exist yet
    }

    var directories = Directory.GetDirectories(parentPath);
    
    foreach (var dir in directories)
    {
        string folderName = Path.GetFileName(dir);
        
        // Skip special folders like .git
        if (folderName.StartsWith("."))
            continue;

        // Check if folder name is numeric (valid index)
        if (!_operations.Index.TryStringToIndex(folderName, out _))
        {
            return (false, folderName); // Found corruption!
        }
    }

    return (true, null);
}
```

### 2. Added Validation to WriteTextWorker.IfMineParentPost()

```csharp
// In PostWriteTextWorker.cs
internal bool IfMineParentPost(...)
{
    if (type != _myUniType) { return false; }
    
    // Validate repository structure - check for non-numeric child folders
    var validation = _readFolder.ValidateChildFoldersAreNumeric(parentAdrTuple);
    if (!validation.IsValid)
    {
        throw new InvalidOperationException(
            $"Invalid repository structure: non-numeric child folder found under {parentAdrTuple.Loca}: {validation.InvalidFolderName}");
    }
    
    // ... rest of method
}
```

### 3. Added Validation to WriteFolderWorker.IfMineParentPost()

Same validation added to prevent folder creation when parent has corrupted structure.

### 4. Cleaned Up Corrupted Data

The corrupted folder was moved to backup:
- **From:** `/Users/pawelfluder/Dropbox/repos/21d11bdc-f1f4-44d1-b61a-3fa6b039c641/03/06/87/status/`
- **To:** `/Users/pawelfluder/Dropbox/repos_corrupted_backup/21d11bdc-f1f4-44d1-b61a-3fa6b039c641/03/06/87/status/`

## Error Message

When validation fails, the system now throws a clear error:
```
Invalid repository structure: non-numeric child folder found under 03/06/87: status
```

## Files Modified

1. `content-provider/api_charp/SharpRepoService/SharpRepoServiceProg/Workers/CrudReads/ReadFolderWorker.cs`
   - Added `ValidateChildFoldersAreNumeric()` method

2. `content-provider/api_charp/SharpRepoService/SharpRepoServiceProg/Workers/CrudWrites/WriteTexts/PostWriteTextWorker.cs`
   - Added validation call at the beginning of `IfMineParentPost()`

3. `content-provider/api_charp/SharpRepoService/SharpRepoServiceProg/Workers/CrudWrites/WriteFolders/PostWriteFolderWorker.cs`
   - Added validation call at the beginning of `IfMineParentPost()`

## Important Notes

- **Do NOT change `SingleOrDefault()` to `FirstOrDefault()`** - The `SingleOrDefault()` correctly detects data integrity violations. Changing it would hide the problem.
- The validation is a **preventive measure** - it stops operations before they can cause further corruption.
- The error message clearly indicates the type of corruption and the offending folder name.

## Files Requiring Attention

1. **Code Files:**
   - `content-provider/api_charp/SharpRepoService/SharpRepoServiceProg/Workers/CrudReads/ReadMultiWorker.cs`
   - `content-provider/api_charp/SharpRepoService/SharpRepoServiceProg/Workers/CrudReads/ReadManyWorker.cs`
   - `content-provider/api_charp/SharpRepoService/SharpRepoServiceProg/Workers/CrudReads/ReadAddressWorker.cs`

2. **Data Files (to clean up):**
   - `/Users/pawelfluder/Dropbox/repos/21d11bdc-f1f4-44d1-b61a-3fa6b039c641/03/06/87/status/`
   - `/Users/pawelfluder/Dropbox/repos/21d11bdc-f1f4-44d1-b61a-3fa6b039c641/03/06/87/02/`

## Conclusion

The immediate cause of the error is **duplicate item names** in the repository data. The underlying code vulnerability is the use of `SingleOrDefault()` without ensuring data integrity constraints that would prevent duplicates.

The most likely scenario is that a "status" item was created at `03/06/87/02/` through the normal API, and later a folder named "status" was manually created at `03/06/87/status/` (possibly by a user or through a different process), violating the implicit assumption that names are unique under a parent folder.