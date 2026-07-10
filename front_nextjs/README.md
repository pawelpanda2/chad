# Next Content Browser

MVP Next.js frontend for browsing Content Provider files.

It recreates the current Blazor UI shape:

- top repo combobox
- loca input
- navigation buttons
- item metadata: Address / Type / Name
- FolderView
- TextView
- CodeEditorTabs with preview/editor tabs

No login is implemented in this MVP.

## Quick Start

### 1. Start the Backend (C# API)

```bash
# Option A: Using SharpContainerApi (dedicated API project)
cd content-provider/api_charp/SharpContainerApi
CONTENT_PROVIDER_ROOT=/path/to/cp-root dotnet run -c Release
# Backend runs on http://localhost:12024

# Option B: Using SimpleRun in API mode
cd content-provider/api_charp/SimpleRun
CONTENT_PROVIDER_API_PORT=12024 dotnet run -- --api
# Backend runs on http://localhost:12024
```

### 2. Start the Frontend (Next.js)

```bash
cd content-provider/front_nextjs
npm install  # if not already done
npm run dev
# Frontend runs on http://localhost:5503
```

### 3. Open the Browser

```
http://localhost:5503
```

## Configuration

### Environment Variables

Create `.env.local` based on `.env.example`:

```env
# Content Provider API URL
# Default port for SharpContainerApi is 12024
# Default port for SimpleRun --api is 5055
NEXT_PUBLIC_CONTENT_API_URL=http://localhost:12024

# Set to "true" to use mock data instead of real backend
# Default is "false" - uses real backend
NEXT_PUBLIC_USE_MOCKS=false
```

## Backend API

The backend uses a generic `/invoke` endpoint that accepts string arguments:

```json
POST /invoke
{
  "args": ["IRepoService", "IItemWorker", "GetItem", "root", "05/08"]
}
```

Response:

```json
{
  "success": true,
  "result": "{...json string...}"
}
```

### Args Format

The args format is: `[serviceName, workerName, methodName, ...params]`

Example calls:
- `["IRepoService", "IItemWorker", "GetItem", "root", ""]` - Get root folder
- `["IRepoService", "IItemWorker", "GetItem", "root", "01"]` - Get folder at 01
- `["IRepoService", "IItemWorker", "GetByNames", "root", "users", "users-list"]` - Get by names

## API Methods

All backend coupling is isolated in `src/lib/api.ts`:

| Next.js function | Backend call | Description |
|-----------------|--------------|-------------|
| `getAllReposNames()` | Hardcoded to `["root"]` | Get list of repos (see note below) |
| `getItem(repo, loca)` | `["IRepoService", "IItemWorker", "GetItem", repo, loca]` | Get item by address |
| `getByNames(repo, ...names)` | `["IRepoService", "IItemWorker", "GetByNames", repo, ...names]` | Get item by names |
| `createItem(repo, loca, type, name)` | `["IRepoService", "IItemWorker", "PutItem", ...]` | Create new item |
| `postByNames(repo, type, ...names)` | `["IRepoService", "IItemWorker", "PostByNames", ...]` | Create item by names |
| `appendLine(repo, loca, value)` | `["IRepoService", "IItemWorker", "AppendLine", ...]` | Append line to text |
| `getBody(repo, loca)` | `["IRepoService", "IItemWorker", "GetBody", repo, loca]` | Get text body |
| `getFolderChildren(repo, loca)` | `["IRepoService", "ManyItemsWorker", "GetList", repo, loca]` | Get folder children |
| `action(name, repo, loca)` | `[name, repo, loca]` | Generic action (stub) |

## Backend Response Format

The backend returns items in this format:

```json
{
  "Body": {...},
  "Settings": {
    "id": "uuid",
    "type": "Folder|Text|Ref",
    "name": "item-name",
    "address": "root/01/02",
    "primaryBody": "body.txt"
  }
}
```

For folders, `Body` contains a dictionary of `{index: name}` for children:
```json
{
  "Body": {"01": "users", "02": "forms"},
  "Settings": {...}
}
```

## Important Notes

### Repository Names

The C# API has a mismatch:
- `GetAllReposNames()` returns directory names (GUIDs like `0fc7da8d-3466-4964-a24c-dfc0d0fef87c`)
- But the API resolves repos by their config name (e.g., `root` from `config.yaml`)

For now, `getAllReposNames()` returns `["root"]` hardcoded. To properly support multiple repos, the C# API needs to be fixed to return config names instead of directory names.

### Content Provider Root

The backend needs the `CONTENT_PROVIDER_ROOT` environment variable to point to the `cp-root` directory:

```bash
CONTENT_PROVIDER_ROOT=/path/to/personal-dashboard/cp-root dotnet run
```

## What Works

- ✅ Repo list loads (currently hardcoded to "root")
- ✅ GO loads item by repo + loca
- ✅ FolderView shows children (via Body dict in item)
- ✅ Click on folder child navigates to that item
- ✅ TextView shows body in CodeEditorTabs
- ✅ GetByNames navigation works

## What's Stubbed

- ⚠️ Action buttons (Folder, Config, Terminal, Script, GoogleDoc, Tts) - backend calls may need adjustment
- ⚠️ No authentication (same as Blazor MVP)
- ⚠️ Multiple repos support limited by C# API returning GUIDs instead of config names

## Running with Docker

See the main project's `docker-compose.*.yml` files for Docker deployment.

## Development Script

For macOS, use the provided script:

```bash
cd content-provider/03_scripts
./local_mac.sh
```

This script:
1. Cleans up ports
2. Checks dependencies (.NET SDK, Node.js)
3. Builds and starts the backend
4. Installs dependencies and starts the frontend