# Content Provider — QNAP TEST deployment

Deploys the existing, unmodified-in-architecture .NET Content Provider (backend
API + Blazor WASM GUI) onto QNAP TEST (s12, Tailscale `100.117.139.83`). Does
NOT touch the paused TypeScript rewrite — see
[typescript-migration-plan.md](typescript-migration-plan.md) for that.

## 1. Requirements on the QNAP host

- Docker + `docker buildx` (multi-platform build support).
- `curl` (used by the scripts for health checks).
- `git` (to clone the `chad` repo).
- A populated repos folder. The backend crashes at startup (unhandled
  exception, not a graceful error) if it finds zero repos — see
  `RepoService.InitGroupsFromSearchPaths` in
  `api_charp/SharpRepoService/SharpRepoServiceProg/Service/RepoService.cs:33-43`.

## 2. Directory layout

All QNAP-TEST-specific scripts and config live inside
`packages/net-content-provider/`, self-contained (no dependency on the
chad-monorepo-level `bash-scripts/`), because this directory is meant to
eventually become a standalone submodule:

```
packages/net-content-provider/
├── .env.qnap-test.example   # template, committed, documents every value
├── .env                      # REAL file, gitignored, copy from the example
├── 03_scripts/qnap/
│   ├── lib.sh                       # shared helpers + constants (not run directly)
│   ├── build_qnap_test.sh           # builds both docker images
│   ├── begin_qnap_test.sh           # starts both containers (idempotent)
│   ├── end_qnap_test.sh             # stops+removes only the test containers
│   ├── status_qnap_test.sh          # reports container/health status
│   └── deploy_qnap_test.sh          # build -> end -> begin -> status, one shot
├── 04_dockerfiles/
│   ├── webapi                       # backend API Dockerfile
│   └── assembly                     # Blazor Dockerfile (bakes ContentProviderApiUrl)
└── api_charp/SharpContainerApi/appsettings.json   # bakes ApiUrls=http://0.0.0.0:12024
```

## 3. Config files

### `.env` (copy from `.env.qnap-test.example`, fill in real values, never commit)

| Key | Read by | Meaning |
|---|---|---|
| `QNAP_REPOS_HOST_PATH` | deploy scripts (mount source) | **Dropbox ROOT, parent of `repos/`** — see §6 quirk below. NOT `/share/Dropbox/repos` itself. |
| `CONTAINER_REPOS_PATH` | deploy scripts (mount target + search-path value) | Path inside the container, e.g. `/data/repos`. |
| `CONTENT_PROVIDER_API_PORT` | deploy scripts (host port + container `ApiUrls` override) | Test range 12020-12029. |
| `BLAZOR_PORT` | deploy scripts (host port only, container always listens on 80) | Test range 12020-12029. |
| `QNAP_PUBLIC_HOST` | `build_qnap_test.sh` only (build-arg, baked into the Blazor image) | QNAP's real address, e.g. `100.117.139.83`. |
| `PreparerModule__NoSqlRepoSearchPaths__0` | documentation/parity only | Not read directly by the scripts — `begin_qnap_test.sh` constructs the real `-e` value itself from `CONTAINER_REPOS_PATH`. |

**Port conflict warning**: port `12020` was previously used by the old
`chad-dashbord` test deployment on this same QNAP (per prior project notes).
Confirm nothing is already bound to `BLAZOR_PORT` before running
`begin_qnap_test.sh` on the real QNAP — change the port in `.env` if needed.

### Env-files table (as requested)

| Plik | Środowisko | Serwis | Kto go czyta | Wymagane pola | Gdzie ma leżeć | Czy kopiowany na QNAP |
|---|---|---|---|---|---|---|
| `.env.qnap-test.example` | QNAP TEST | backend + Blazor (docs) | człowiek (szablon) | — | `packages/net-content-provider/` (git, committed) | Nie (to tylko wzór) |
| `.env` | QNAP TEST | `03_scripts/qnap/*.sh` | skrypty bash | `QNAP_REPOS_HOST_PATH`, `CONTAINER_REPOS_PATH`, `CONTENT_PROVIDER_API_PORT`, `BLAZOR_PORT`, `QNAP_PUBLIC_HOST` | `packages/net-content-provider/.env` (gitignored) | Tak — kopiowany ręcznie/scp na QNAP po `git clone` |
| `appsettings.json` | wszystkie | backend API (.NET `IConfiguration`) | proces API w kontenerze | `ApiUrls` (nadpisywane przez `-e ApiUrls=...`) | wypiekane w obrazie (`04_dockerfiles/webapi`) | Nie osobno — jest w obrazie |
| `wwwroot/appsettings.json` | wszystkie | Blazor WASM (przeglądarka) | `WebAssemblyHostBuilder.Configuration` | `ContentProviderApiUrl` (podmieniane `sed`-em przy buildzie z `CONTENT_PROVIDER_API_URL` build-arg) | wypiekane w obrazie (`04_dockerfiles/assembly`) | Nie osobno — jest w obrazie |

## 4. Build → Deploy → Begin → End → Status

```bash
cd packages/net-content-provider
cp .env.qnap-test.example .env   # then edit real values
bash 03_scripts/qnap/deploy_qnap_test.sh   # one-shot: build + (re)start + verify
```

Or step by step:

```bash
bash 03_scripts/qnap/build_qnap_test.sh    # builds cp_webapi_test / cp_blazor_test images
bash 03_scripts/qnap/begin_qnap_test.sh    # starts both containers; if already running, stops then restarts
bash 03_scripts/qnap/status_qnap_test.sh   # container status + health
bash 03_scripts/qnap/end_qnap_test.sh      # stops+removes only cp-api-test/cp-blazor-test
```

`begin_qnap_test.sh` is idempotent — running it while QNAP TEST is already up
stops the previous instance first (via `end_qnap_test.sh`) then starts fresh,
rather than erroring.

### Image tags

Every build tags both images with the fixed name the scripts run
(`cp_webapi_test:latest`, `cp_blazor_test:latest`) **and** a timestamped
`YYMMDD_HHMMSS_<arch>` tag for history/traceability, e.g.
`cp_webapi_test:260711_012921_mac` or `..._linux` on the QNAP itself. Only the
`:latest`-style tag is actually run by `begin_qnap_test.sh`.

## 5. Ports, mounts, health checks

- Backend API: `-p $CONTENT_PROVIDER_API_PORT:$CONTENT_PROVIDER_API_PORT` (default `12024:12024`).
- Blazor GUI: `-p $BLAZOR_PORT:80` (default `12020:80`, nginx inside the container always listens on 80).
- Repos mount: `-v $QNAP_REPOS_HOST_PATH:$CONTAINER_REPOS_PATH:rw` (read-write; the app currently only reads, but `Put`/`PostParentItem` exist so `:rw` is kept).
- `/health` (backend): resolves the real `IRepoService` from the DI container
  and calls `Methods.GetReposCount()` — the exact same count
  `InitGroupsFromSearchPaths` checks at startup — not a naive directory
  listing. Returns `{ status, configured, pathDiagnostics, repoServiceAvailable, repoCount, anyRepoFound, timestamp }`.
- `begin_qnap_test.sh` polls `/health` up to 30×2s and fails loudly if
  `anyRepoFound` isn't `true`.

## 6. Known quirk — repos-path nesting (not a bug, confirmed intentional, TODO for later)

`GuidGroupsHelper.GetGuidGroupsForSearchFolders()`
(`api_charp/SharpRepoService/SharpRepoServiceProg/Helpers/GuidGroupsHelper.cs:38-67`)
hardcodes `Path.Combine(searchFolders.First(), "repos")` and only ever reads
`searchFolders.First()` (ignores any additional configured search paths).
Real repo structure is therefore:

```
<QNAP_REPOS_HOST_PATH>/repos/<group-guid>/<repo-folder>/...
```

So `QNAP_REPOS_HOST_PATH` (and the local `PreparerModule__NoSqlRepoSearchPaths__0`
value the container sees) must be the **parent of `repos/`**, not `repos/`
itself. Pointing directly at `.../repos` makes the app look for a
nonexistent `.../repos/repos` and it finds 0 repos, which crashes the whole
API at startup.

Verified against real local data on 2026-07-11: pointing at
`/Users/pawelfluder/Dropbox` (parent, containing the real `repos/` folder)
gave `repoCount: 36` via the real `IRepoService.Methods.GetReposCount()`;
pointing directly at `/Users/pawelfluder/Dropbox/repos` crashed the app at
startup (`GetReposCount()` returned 0).

**TODO (future, out of scope for this deployment):** the user confirmed this
is intentional legacy behavior, not something to fix now, but wants to
revisit `GuidGroupsHelper`'s hardcoded `"repos"` segment and
single-search-path limitation later.

## 7. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| API container exits immediately / crash loop | `QNAP_REPOS_HOST_PATH` points at `repos/` itself instead of its parent, or the repos folder is empty | Point `.env`'s `QNAP_REPOS_HOST_PATH` at the parent of `repos/` (see §6); confirm folder is non-empty |
| `begin_qnap_test.sh` times out waiting for API health | Container's internal `ApiUrls` (baked into `appsettings.json` as `http://0.0.0.0:12024`) doesn't match `CONTENT_PROVIDER_API_PORT` | Already fixed — `begin_qnap_test.sh` passes `-e "ApiUrls=http://0.0.0.0:$CONTENT_PROVIDER_API_PORT"` to override it |
| `/health` shows `anyRepoFound:false` but `configured:true` | Search path exists but no valid `repos/<group-guid>/<repo>` structure under it | Check `pathDiagnostics` in the `/health` response; confirm the real folder structure matches §6 |
| Blazor GUI loads but can't reach the API | `ContentProviderApiUrl` baked at build time doesn't match the real QNAP address/port | Rebuild with correct `QNAP_PUBLIC_HOST`/`CONTENT_PROVIDER_API_PORT` in `.env` — this value can't be changed at runtime for Blazor WASM, only at build time |
| Port already in use | Another service (e.g. old `chad-dashbord` on 12020) already bound to the chosen port | Change `BLAZOR_PORT`/`CONTENT_PROVIDER_API_PORT` in `.env` to a free port in the 12020-12029 test range |

## 8. Rollback

`end_qnap_test.sh` stops and removes only `cp-api-test`/`cp-blazor-test` — it
never touches production, local-mac, or any other container, and never
deletes the repos data (only the bind mount is removed, not the underlying
host files). To roll back to a previous image build, retag the desired
timestamped image (e.g. `cp_webapi_test:260710_231500_mac`) as
`cp_webapi_test:latest` and re-run `begin_qnap_test.sh`.

## 9. Verified locally (2026-07-11)

Full `build → begin → status → begin (idempotent restart) → end` cycle run
against real local Dropbox data as a stand-in for the QNAP mount
(`/Users/pawelfluder/Dropbox`, containing the real `repos/` folder with 36
recognized repos). All steps passed:

- Build: both images built and tagged (`:latest` + timestamped).
- Begin: containers started, `/health` reported `repoCount:36`, `anyRepoFound:true`.
- Status: both containers up, both health checks passed.
- Begin again (already running): stopped previous instance automatically, restarted cleanly.
- End: both test containers stopped/removed; the user's separate, unrelated `cp_blazor` container (running 2 days) was confirmed untouched throughout.

Not yet tested: the real QNAP host itself (no SSH access from this session) —
this local test used local Dropbox data as a realistic stand-in for
`/share/Dropbox`, not the actual QNAP filesystem.
