# cp-plugin

Locally-installed desktop helper for Content Provider GUIs (`cp-gui`). Migrated 2026-07-10 from `packages/net-content-provider/plugin_nodejs` — same code, fixed package name, no `node_modules`/build output copied.

## What this is

A separate, small local HTTP server (default port `12026`) providing desktop integrations that a browser-based GUI cannot do itself:

- `GET /openconfig/{address}` — open `config.yaml` in an editor (Nova, via AppleScript)
- `GET /openbody/{address}` — open `body.txt` in an editor
- `GET /openfolder/{address}` — open the folder in Finder
- `GET /terminal/{address}` — open Terminal in the folder
- `GET /health` — health check
- `GET /swagger`, `/swagger.json` — API docs

`address` format: `{repoGuid}-{physical-loca-with-dashes}` or just `{repoGuid}`, e.g. `0fc7da8d-3466-4964-a24c-dfc0d0fef87c-01-02`.

## What this is NOT

- Not part of the Content Provider backend (`packages/content-provider/*`) — no dependency in either direction.
- Not part of `cp-gui` — a separate process the GUI calls over `localhost` HTTP.
- Not required for `cp-gui` to work: browsing and editing must function with `cp-plugin` unreachable. GUI buttons for "open in editor" / "open folder" / "open terminal" should disable or show a clear message instead of failing silently or blocking the rest of the UI.

## Config

Copy `.env.example` to `.env`:

```env
PORT=12026
PLUGIN_ROOT=/path/to/content-provider/repos
```

`PLUGIN_ROOT` must point at the same root the running Content Provider serves data from (currently, for local dev: the `CONTENT_PROVIDER_STORAGE_HOST` used by `packages/net-content-provider`'s Docker setup).

## Resolved note (2026-07-10, closed 2026-07-12)

`/openbody/` opens `body.txt` — this is correct and final. Settled definitively on 2026-07-12 by reading the real .NET source (`PathWorker.SetNames`/`GetBodyPath`) and inspecting 12630 real config.yaml/body.txt pairs on disk: there is no extensionless `body` variant anywhere in the running code or on disk, no legacy/current split. See `packages/content-provider/files/README.md` for the full writeup.

## Run

```bash
npm install
npm run dev
```
