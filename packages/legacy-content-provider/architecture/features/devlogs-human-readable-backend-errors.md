# Feature: Human-Readable Backend Error Formatter

## Date: 2026-06-29 (Rebuilt from scratch)

## Overview

This feature provides a human-readable display of backend errors in the DevErrorPanel. Instead of showing raw JSON with escaped characters, stack traces, and technical details, it presents a clean, structured view with two main sections: **SOURCE** and **ANALYSIS**.

## Problem Statement

The DevErrorPanel was displaying raw backend errors as large JSON blocks with:
- Escaped characters
- `TargetInvocationException` wrappers
- `innerException` chains
- Full stack traces
- Other technical details

This made it difficult for developers to quickly understand what went wrong.

### Specific Issues Found

1. **SOURCE section was incomplete** - Only showed `IRepoService.IItemWorker` without the method name
2. **Missing method name from arg2** - The method name (e.g., `GetItem`, `PostParentItem`) was not displayed
3. **Missing method arguments from arg3+** - Arguments passed to the method were not shown
4. **Time was split across two lines** - Formatting issue in the UI
5. **Request args shown as arg0/arg1/arg2** - Not formatted as a proper method call

## Solution

### Key Principle: Request Args Structure

**This is the most important concept.** Request args are NOT simple fields. They represent a backend method invocation:

```
arg0 = service name    (e.g., IRepoService)
arg1 = worker name     (e.g., IItemWorker)
arg2 = method name     (e.g., GetItem)
arg3+ = arguments passed to the method (e.g., repo, loca, type, name)
```

### BuildMethodCall Function

The core of the fix is the `BuildMethodCall` function in `BackendErrorFormatter.cs`:

```csharp
public static string BuildMethodCall(IReadOnlyList<string> args)
{
    if (args == null || args.Count == 0)
        return "(unknown backend call)";

    if (args.Count == 1)
        return args[0];

    if (args.Count == 2)
        return $"{args[0]}.{args[1]}";

    // args.Count >= 3
    var service = args[0];
    var worker = args[1];
    var method = args[2];
    var methodArgs = args.Skip(3).ToList();

    if (methodArgs.Count == 0)
        return $"{service}.{worker}.{method}()";

    return $"{service}.{worker}.{method}({string.Join(", ", methodArgs)})";
}
```

### Examples

**Example 1: GetItem with 2 arguments**
```
Input:  [IRepoService, IItemWorker, GetItem, 3ad94b17-66a8-4e21-b442-d84f64a271b3, 05/31]
Output: IRepoService.IItemWorker.GetItem(3ad94b17-66a8-4e21-b442-d84f64a271b3, 05/31)
```

**Example 2: PostParentItem with 4 arguments**
```
Input:  [IRepoService, IItemWorker, PostParentItem, 3ad94b17-66a8-4e21-b442-d84f64a271b3, 05, Text, ff]
Output: IRepoService.IItemWorker.PostParentItem(3ad94b17-66a8-4e21-b442-d84f64a271b3, 05, Text, ff)
```

## Data Flow

1. **BackendAdapter** (`BackendAdapters/Workers/BackendAdapter.cs`)
   - Captures the request args when making API calls
   - Passes them to the error logger when an error response is detected

2. **DevLogService** (`BlazorApp/Services/DevLogService.cs`)
   - Stores the args in `AdditionalData` field as: `Request args: [arg0, arg1, arg2, ...]`
   - Also stores the raw original log unchanged in `RawOriginalLog`

3. **DevErrorPanel** (`BlazorApp/Components/DevErrorPanel.razor`)
   - Extracts the args from `AdditionalData` using regex
   - Passes them to the formatter

4. **BackendErrorFormatter** (`BlazorApp/Services/BackendErrorFormatter.cs`)
   - Uses `BuildMethodCall` to format the args into a method call string
   - Parses the backend error JSON for the ANALYSIS section
   - Preserves the raw original log for the RAW DETAILS section

## Final UI Format

The human-readable view has only two main sections:

```
BACKEND ERROR #1
2026-06-29 13:03:37.827

SOURCE
Time: 2026-06-29 13:03:37.827
Call: IRepoService.IItemWorker.GetItem(3ad94b17-66a8-4e21-b442-d84f64a271b3, 05/31)

ANALYSIS
Wrapper: System.Reflection.TargetInvocationException
Type: System.IO.FileNotFoundException
Message: Could not find file '/Users/pawelfluder/Dropbox/repos/3ad94b17-66a8-4e21-b442-d84f64a271b3/05/31/body.txt'.
Path: /Users/pawelfluder/Dropbox/repos/3ad94b17-66a8-4e21-b442-d84f64a271b3/05/31/body.txt
Location: StringArgsResolverService.cs Line 80
Method: StringArgsResolverService.TryInvoke
Call chain: MethodBaseInvoker.InvokeWithFewArgs → StringArgsResolverService.TryInvoke
Likely cause: Missing file at the resolved path. For Text item, check whether body.txt exists.

[+] Raw details
```

### Formatting Rules

**Correct (label and value on same line):**
```
Time: 2026-06-29 13:03:37.827
Call: IRepoService.IItemWorker.GetItem(...)
Wrapper: System.Reflection.TargetInvocationException
Type: System.IO.FileNotFoundException
```

**Incorrect (label and value on separate lines):**
```
Time:
2026-06-29 13:03:37.827

Wrapper:
System.Reflection.TargetInvocationException
```

## Source of Data

| Section | Data Source |
|---------|-------------|
| **SOURCE** | Uses `request args` from the log entry's `AdditionalData` field |
| **ANALYSIS** | Uses the backend error JSON (`BackendErrorInfo`) |
| **RAW DETAILS** | Preserves the original backend response unchanged (with `error:` prefix removed for display, JSON pretty-printed) |

## Diagnostic Logging

The formatter includes comprehensive diagnostic logging to help debug issues:

```
[BackendErrorFormatter] === Diagnostic for error ===
[BackendErrorFormatter]   requestArgs.Count = 5
[BackendErrorFormatter]   arg0 = IRepoService
[BackendErrorFormatter]   arg1 = IItemWorker
[BackendErrorFormatter]   arg2 = GetItem
[BackendErrorFormatter]   arg3 = 3ad94b17-66a8-4e21-b442-d84f64a271b3
[BackendErrorFormatter]   arg4 = 05/31
[BackendErrorFormatter]   Built call = IRepoService.IItemWorker.GetItem(3ad94b17-66a8-4e21-b442-d84f64a271b3, 05/31)
[BackendErrorFormatter] ==========================
```

## Files Modified

1. **`front_blazor/BlazorApp/Services/BackendErrorFormatter.cs`**
   - `FormattedBackendError` model with `Time` and `MethodCall` properties
   - `BuildMethodCall` function with proper arg0/arg1/arg2/arg3+ handling
   - Diagnostic logging for debugging
   - Path extraction that preserves leading slash for Unix paths
   - Known error pattern recognition for likely cause suggestions

2. **`front_blazor/BlazorApp/Components/DevErrorPanel.razor`**
   - SOURCE section with `Time:` and `Call:` on single lines (using flexbox CSS)
   - Request args extraction from `AdditionalData` using regex
   - Diagnostic logging for request args
   - ANALYSIS section with proper formatting
   - Raw details toggle with pretty-printed JSON

3. **`front_blazor/BackendAdapters/Workers/BackendAdapter.cs`**
   - Passes request args to the error logger

4. **`front_blazor/BlazorApp/Services/DevLogService.cs`**
   - Stores request args in `AdditionalData` field
   - Preserves raw original log in `RawOriginalLog` field

## Known Error Patterns

The formatter recognizes these error patterns and provides helpful cause suggestions:

| Pattern | Likely Cause |
|---------|--------------|
| `Read-only file system` | Docker volume / Dropbox path is mounted read-only or container has no write access |
| `Could not find file` | Missing file at the resolved path. For Text item, check whether body.txt exists |
| `Could not find a part of the path` | The specified directory or file path does not exist |
| `Permission denied` | Container process lacks permission to access the specified path |
| `Access to the path ... is denied` | Container process lacks permission |
| `There is not enough space on the disk` | Disk is full or quota exceeded |
| `The process cannot access the file ... because it is being used by another process` | Another process has locked this file |
| `The network path was not found` | Network share or mounted volume is not accessible |
| `Illegal characters in path` | File path contains invalid characters |

## Testing

To test this feature:

1. Trigger a backend error (e.g., try to access a missing body.txt file)
2. Open the Dev Panel (click the 🔧 icon on the right side)
3. Go to the "Exceptions" tab
4. Verify the error is displayed with:
   - **SOURCE section** showing:
     - `Time: <timestamp>` on one line
     - `Call: IRepoService.IItemWorker.GetItem(repo, loca)` on one line
   - **ANALYSIS section** showing wrapper type, error type, message, path, location, method, call chain, and likely cause
5. Check console logs for diagnostic output showing the request args extraction

## Acceptance Criteria

The UI **must** show:

```
SOURCE
Time: 2026-06-29 13:03:37.827
Call: IRepoService.IItemWorker.GetItem(3ad94b17-66a8-4e21-b442-d84f64a271b3, 05/31)

ANALYSIS
Wrapper: System.Reflection.TargetInvocationException
Type: System.IO.FileNotFoundException
...
```

**If the UI only shows `IRepoService.IItemWorker` without the method name and arguments, the task is NOT complete.**

## Edge Cases Handled

1. **Empty args**: Returns `(unknown backend call)`
2. **Single arg**: Returns just that arg
3. **Two args**: Returns `arg0.arg1`
4. **Three args (no method args)**: Returns `service.worker.method()`
5. **Three+ args**: Returns `service.worker.method(arg3, arg4, ...)`
6. **Missing inner exception**: ANALYSIS section still works with root exception data
7. **Non-JSON error responses**: Falls back to simple error formatting