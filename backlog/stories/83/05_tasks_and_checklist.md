# Story 83 — Tasks Checklist

| # | Ai Status | Real Status | Task |
|---|-----------|-------------|------|
| 1 | DONE      |             | Dev Panel has a "Settings" tab with a combobox showing which Mongo (Local/QNAP) the app is connected to |
| 2 | DONE      |             | Changing the combobox actually switches the live connection, no restart needed |

# Task 1 — Settings tab with DB source combobox

**Requested:** In the Dev Panel, a "Settings" tab with a combobox to see/choose which database is in use.
**Done:** New `'settings'` tab in `dev-panel-store.tsx`/`dev-panel.tsx`, rendering a `<select>` (Local / QNAP) that loads the current source + resolved `host:port` (no credentials shown) from `GET /api/dev-settings/db-source` on mount.
**Files changed:** `packages/dashboard/lib/dev-panel/dev-panel-store.tsx`, `packages/dashboard/components/dev-panel/dev-panel.tsx`, `packages/dashboard/app/api/dev-settings/db-source/route.ts` (new).
**Tested:** `tsc --noEmit` clean; API round-trip verified via curl (see Task 2). The React component itself was not click-through tested in a real browser this round — see `06_others_from_report.md` for why, and what's left to verify.
**Status: DONE**

# Task 2 — Combobox really switches the connection

**Requested:** A real live switch, not just a display (explicit user answer to the scope-clarifying question).
**Done:** `packages/dba/src/dev-db-override.ts` (new) holds the selected source + a generation counter; `mongo.ts`'s `connect()`/`connectBeeperServer()` tear down and reopen the cached `MongoClient` whenever the generation changes, so the very next Mongo operation uses the new target. Hard-blocked in production (`NODE_ENV==="production"`, true for every Docker deployment) so this can never affect a shared multi-user server.
**Files changed:** `packages/dba/src/dev-db-override.ts` (new), `packages/dba/src/mongo.ts`, `packages/dba/src/index.ts`, `packages/dashboard/app/api/dev-settings/db-source/route.ts`.
**Tested:** Real curl against a local bare `next dev` process: `POST {source:"local"}` then `GET /api/folders` → real `ENOTFOUND mongodb` (correctly unreachable from bare host, proving the switch took effect); `POST {source:"qnap"}` then `GET /api/folders` → 200 with real data. Repeated cleanly twice to rule out a flaky first attempt.
**Status: DONE**
