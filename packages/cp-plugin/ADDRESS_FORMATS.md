# Address Formats

The plugin supports multiple address formats for accessing repositories and their subfolders.

## Supported Formats

### 1. UUID Only (opens repo root)
```
0fc7da8d-3466-4964-a24c-dfc0d0fef87c
```
Resolves to:
```
/Users/pawelfluder/Dropbox/repos/0fc7da8d-3466-4964-a24c-dfc0d0fef87c
```

### 2. UUID with Local Path
```
0fc7da8d-3466-4964-a24c-dfc0d0fef87c-01
```
Resolves to:
```
/Users/pawelfluder/Dropbox/repos/0fc7da8d-3466-4964-a24c-dfc0d0fef87c/01
```

### 3. UUID with Nested Local Path
```
0fc7da8d-3466-4964-a24c-dfc0d0fef87c-01-02-003-02
```
Resolves to:
```
/Users/pawelfluder/Dropbox/repos/0fc7da8d-3466-4964-a24c-dfc0d0fef87c/01/02/003/02
```

### 4. 32-Hex-Chars Only (legacy format)
```
6a2c9428afbc81918be759b6e4e8493d
```
Resolves to:
```
/Users/pawelfluder/Dropbox/repos/6a2c9428afbc81918be759b6e4e8493d
```

### 5. 32-Hex-Chars with Local Path (legacy format)
```
6a2c9428afbc81918be759b6e4e8493d-01-02-003-02
```
Resolves to:
```
/Users/pawelfluder/Dropbox/repos/6a2c9428afbc81918be759b6e4e8493d/01/02/003/02
```

## How Local Path Works

The local path part (after the GUID) uses dashes as separators, which are converted to slashes in the file system:

- `01` → `/01`
- `01-02` → `/01/02`
- `01-02-003-02` → `/01/02/003/02`

## Example API Calls

### Open folder (just repo root)
```
GET http://localhost:12026/openfolder/0fc7da8d-3466-4964-a24c-dfc0d0fef87c
```

### Open folder with local path
```
GET http://localhost:12026/openfolder/0fc7da8d-3466-4964-a24c-dfc0d0fef87c-01
```

### Open config file
```
GET http://localhost:12026/openconfig/0fc7da8d-3466-4964-a24c-dfc0d0fef87c-01
```
Opens: `/Users/pawelfluder/Dropbox/repos/0fc7da8d-3466-4964-a24c-dfc0d0fef87c/01/config.yaml`

### Open body file
```
GET http://localhost:12026/openbody/0fc7da8d-3466-4964-a24c-dfc0d0fef87c-01
```
Opens: `/Users/pawelfluder/Dropbox/repos/0fc7da8d-3466-4964-a24c-dfc0d0fef87c/01/body.txt`

### Open terminal
```
GET http://localhost:12026/terminal/0fc7da8d-3466-4964-a24c-dfc0d0fef87c-01
```
Opens Terminal in: `/Users/pawelfluder/Dropbox/repos/0fc7da8d-3466-4964-a24c-dfc0d0fef87c/01`