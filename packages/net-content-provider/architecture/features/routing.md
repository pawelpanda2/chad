# Routing Architecture

## Overview

This document describes the routing architecture for the Blazor frontend application. The routing is non-standard and follows a specific pattern designed to directly represent content addresses in URLs.

## Key Principles

1. **No `/repos/` prefix**: URLs do NOT use the standard `/repos/{id}` pattern
2. **Direct root routing**: Content addresses are placed directly after the root domain
3. **Format**: `/{contentAddress}`

## URL Format

### Basic Structure

```
/{contentAddress}
```

Where `contentAddress` has the format:

```
{repoGuid}-{segment}-{segment}-{segment}...
```

### Components

#### Repository GUID (`repoGuid`)

The first part of the address is a GUID representing the repository/root:

```
0fc7da8d-3466-4964-a24c-dfc0d0fef87c
```

#### Address Segments

After the GUID, additional segments are appended with hyphens. These segments are:
- Two-digit or three-digit numbers
- Examples: `01`, `02`, `04`, `101`, `06`

### Examples

#### Root Repository

```
/0fc7da8d-3466-4964-a24c-dfc0d0fef87c
```

#### Nested Content Item

```
/0fc7da8d-3466-4964-a24c-dfc0d0fef87c-01-02-04-101-06
```

## Incorrect vs Correct URLs

### ❌ INCORRECT (with `/repos/` prefix)

```
https://localhost:61319/repos/0fc7da8d-3466-4964-a24c-dfc0d0fef87c
```

```
https://localhost:61319/repos/0fc7da8d-3466-4964-a24c-dfc0d0fef87c-01-02-04-101-06
```

### ✅ CORRECT (without prefix)

```
https://localhost:61319/0fc7da8d-3466-4964-a24c-dfc0d0fef87c
```

```
https://localhost:61319/0fc7da8d-3466-4964-a24c-dfc0d0fef87c-01-02-04-101-06
```

## Implementation Details

### Route Configuration

Routes are defined in `Pages/Root.razor`:

```razor
@page "/"
@page "/{ContentAddress}"
```

The `ContentAddress` parameter captures the entire address string and passes it to the `Repos` component.

### Address Parsing

The `UrlAddressParser` class handles parsing of the content address:

1. **Empty address**: Routes to the first available repository
2. **Repository only**: Address contains only the GUID (no segments)
3. **Full address**: Address contains GUID with segments

### Important Notes

1. **GUID Parsing**: The GUID contains hyphens as part of its format (e.g., `0fc7da8d-3466-4964-a24c-dfc0d0fef87c`). Parsing must not incorrectly split the GUID. The first 36 characters represent the GUID.

2. **Empty Loca**: An empty `loca` (location/path) parameter in backend requests is valid for root items and is not an error. The request format:
   ```
   ["IRepoService","IItemWorker","GetItem","0fc7da8d-3466-4964-a24c-dfc0d0fef87c",""]
   ```
   is correct for root-level items.

3. **URL Generation**: The `CreateUrl` method in `NoSqlAddressOperations` generates URLs without any prefix. The `baseName` parameter should be an empty string `""`, not `"repos"`.

## Backend Request Format

The frontend communicates with the backend using the following format:

```csharp
["IRepoService", "IItemWorker", "GetItem", repoAddress, locaPath]
```

Where:
- `repoAddress`: The repository GUID (e.g., `0fc7da8d-3466-4964-a24c-dfc0d0fef87c`)
- `locaPath`: The location path with forward slashes (e.g., `01/02/04/101/06`) or empty string for root

Example for root item:
```
["IRepoService","IItemWorker","GetItem","0fc7da8d-3466-4964-a24c-dfc0d0fef87c",""]
```

Example for nested item:
```
["IRepoService","IItemWorker","GetItem","0fc7da8d-3466-4964-a24c-dfc0d0fef87c","01/02/04/101/06"]