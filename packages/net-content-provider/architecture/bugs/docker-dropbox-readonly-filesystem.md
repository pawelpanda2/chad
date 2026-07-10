# Bug: Docker Dropbox Mount - Read-only Filesystem

## Date: 2026-06-29

## Summary

The Docker container for the C# API was mounting the Dropbox directory as read-only, causing `System.IO.IOException: Read-only file system` errors when attempting to create new folders or items through `IRepoService -> IItemWorker -> PostParentItem()`.

## Error Details

### Backend Error
```
System.IO.IOException: Read-only file system : 
'/Users/pawelfluder/Dropbox/repos/3ad94b17-66a8-4e21-b442-d84f64a271b3/05/32'
```

### Stack Trace
```
System.IO.FileSystem.CreateDirectory(String fullPath, UnixFileMode unixCreateMode)
System.IO.Directory.CreateDirectory(String path)
SharpRepoServiceProg.Workers.System.SystemWorker.CreateDirectoryIfNotExists(...)
SharpRepoServiceProg.Workers.CrudWrites.WriteTexts.WriteTextWorker.Put(...)
SharpRepoServiceProg.Workers.CrudWrites.WriteTexts.WriteTextWorker.IfMineParentPost(...)
SharpRepoServiceProg.Workers.CrudWrites.WriteMultiWorker.PostItem(...)
SharpRepoServiceProg.Workers.APublic.ItemWorkers.ItemWorker.PostParentItem(...)
```

## Root Cause

In the Docker run script `03_scripts/03_local-mac_docker/02_run_api_charp.sh`, the Dropbox volume was mounted with the `:ro` (read-only) flag:

```bash
-v "/Users/pawelfluder/Dropbox:/Users/pawelfluder/Dropbox:ro" \
```

This prevented any write operations to the Dropbox directory from within the container, including:
- Creating new repository folders
- Creating new items (texts, etc.)
- Any other file system modifications

## Solution

Remove the `:ro` flag from the Dropbox volume mount to allow read-write access:

**Before:**
```bash
-v "/Users/pawelfluder/Dropbox:/Users/pawelfluder/Dropbox:ro" \
```

**After:**
```bash
-v "/Users/pawelfluder/Dropbox:/Users/pawelfluder/Dropbox" \
```

## Files Modified

- `03_scripts/03_local-mac_docker/02_run_api_charp.sh` - Removed `:ro` flag from Dropbox mount

## Testing

After applying the fix:
1. Rebuild the Docker image if needed
2. Restart the container using the updated script
3. Attempt to create a new item through the API
4. Verify that folders are created successfully in Dropbox

## Prevention

When mounting volumes in Docker:
- Only use `:ro` (read-only) for volumes that should never be modified
- For storage directories that need write access (like repos, user data), ensure mounts are read-write (default)
- Document any intentional read-only mounts and their rationale

## Related Code

The failing operation occurs in:
- `api_charp/SharpRepoService/SharpRepoServiceProg/Workers/System/SystemWorker.cs`
  - Method: `CreateDirectoryIfNotExists((string Repo, string Loca) adrTuple)`
  - This method calls `Directory.CreateDirectory(path)` which requires write permissions