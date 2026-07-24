# Story 83 — Knowledge

- `bash-scripts/dashboard/03_local_mac_docker/01_config.sh` — the pre-existing
  `DBA_MONGO_MODE` local/qnap switch this Story brings into the running app;
  same QNAP Tailscale host/port (`100.117.139.83:12040`) and
  `MONGO_ROOT_USERNAME`/`MONGO_ROOT_PASSWORD` credential source, reused
  as-is rather than re-derived.
- `packages/dashboard/lib/flags.ts` — `NODE_ENV==="production"` is true for
  every Docker-built deployment regardless of environment name (local-docker,
  QNAP test, QNAP prod) — the exact fact `dev-db-override.ts`'s production
  guard depends on.
- `packages/dashboard/middleware.ts` — already requires a `session` cookie
  on every `/api/*` route; `/api/dev-settings/db-source` gets this for free,
  no extra auth code needed in the route itself.
- `packages/dba/src/mongo.ts` / `data-router-instance.ts` — confirmed
  `MongoCpProvider` never caches a `Db` handle (always calls `getMongoDb()`
  fresh per operation), so only `mongo.ts`'s own client cache needed
  generation-aware invalidation; the router/provider singletons in
  `data-router-instance.ts` did not.
