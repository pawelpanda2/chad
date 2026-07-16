# Story 61 — Tasks Checklist

| # | Ai Status | Real Status | Task |
|---|-----------|-------------|------|
| 1 | DONE      |             | Fix `contacts`' local MongoDB so it actually starts as a replica set (`rs0`) with keyFile-based auth, without losing existing data |
| 2 | DONE      |             | Resolve the host port 27017 conflict with the `chad` monorepo's own mongo container by moving `contacts`' mongo to port 27018 |
| 3 | DONE      |             | Fix `ReplicaSetNoPrimary` caused by the replica set advertising the wrong (in-container) port, by adding `directConnection=true` everywhere `contacts` builds a Mongo URI |
| 4 | NOT DONE  |             | Run the full `contacts` stack (`local_run_all.sh`: beeper-ws, beeper-oplog, dashboard, Google Contacts sync) end-to-end against the fixed database |

# Task 1 — Get the replica set actually running

**Requested:** `docker exec mongodb mongosh ... rs.initiate(...)` was failing
with "This node was not started with replication enabled" — the container
was never started with `--replSet rs0`. Fix `local_run_mongodb.sh` so it
starts mongod with `--replSet rs0`, a keyFile (required once auth +
replication are combined), waits for Mongo to be ready, runs an
authenticated `rs.initiate()`, and only declares success once
`isWritablePrimary: true` and `setName: 'rs0'` are both confirmed — without
deleting the existing `mongodb_data` volume.

**Done:** Rewrote `contacts/03_scripts/local_run_mongodb.sh`:
- Generates a keyFile once into a dedicated `mongodb_keyfile` Docker volume
  (created inside a container so the file ends up owned by uid/gid `999:999`,
  matching the image's `mongodb` user).
- Detects an existing container that lacks `--replSet` in its `Cmd` and
  recreates it with `mongod --replSet rs0 --bind_ip_all --keyFile <path>`,
  reusing the original `mongodb_data` volume unchanged.
- Detects whether an admin user already exists in the (preserved) data and
  picks the authenticated vs. anonymous-localhost-exception path for
  `rs.initiate()`/`createUser()` accordingly (this project's actual data
  already had an admin user, so `rs.initiate()` had to run authenticated).
- Polls for `db.runCommand({ping:1})` before proceeding, and for
  `isWritablePrimary: true` + `setName: rs0` before printing success,
  instead of a blind fixed `sleep`.

**Files changed:** `contacts/03_scripts/local_run_mongodb.sh`.

**Tested:** Ran the script directly (not `local_run_all.sh`, per the user's
explicit instruction). Confirmed via `docker exec mongodb mongosh ...
rs.status()` / `db.hello()` that the running container reports
`setName: 'rs0'`, `isWritablePrimary: true`, `primary: 'localhost:27017'`.

**Status: DONE**

# Task 2 — Resolve the port 27017 conflict

**Requested:** Not explicitly asked in Input 1/2, but discovered while
executing Task 1: removing the old (broken) `mongodb` container to recreate
it freed host port 27017, which was immediately re-claimed by the `chad`
monorepo's `chad-mongodb-local-mac-docker` container (`restart:
unless-stopped`), blocking recreation. Asked the user how to resolve it;
user chose "move `contacts`' mongo to a different host port" over stopping
the other project's container.

**Done:** Changed `local_run_mongodb.sh` to publish the container on host
port **27018** (`MONGO_HOST_PORT`) while mongod inside the container still
listens on the standard 27017 (`MONGO_CONTAINER_PORT`). Updated
`contacts/.env` and `.env.example`'s `MONGODB_URI` to `localhost:27018`,
and the fallback default in `packages/dashboard/src/lib/db.js`. Confirmed
no other script hardcodes the old port outside of what was already updated
in Task 3 below.

**Files changed:** `contacts/03_scripts/local_run_mongodb.sh`,
`contacts/.env`, `contacts/.env.example`,
`contacts/packages/dashboard/src/lib/db.js`.

**Tested:** `docker ps` showing both `mongodb` (27018) and
`chad-mongodb-local-mac-docker` (27017) running simultaneously without
collision; `nc -zv localhost 27018` succeeded from the Mac host.

**Status: DONE**

# Task 3 — Fix `ReplicaSetNoPrimary` after the port move

**Requested:** After Task 2's port move, the driver reported
`ReplicaSetNoPrimary` / `servers: Map(0) {}` even though `rs0` was
initialized. User diagnosed (and this was confirmed via `rs.conf()`) that
the replica set member is advertised as `localhost:27017` — the
in-container port — while the app connects on host port 27018, so the
driver's topology discovery tries to hop to the wrong (or another
project's) `localhost:27017` after the initial handshake. User proposed two
fixes (`rs.reconfig` to `host.docker.internal:27018`, or
`directConnection=true` on every URI) and asked for `directConnection=true`
to be applied consistently across `.env`, `beeper-sync`, `beeper-ws`,
`beeper-oplog`, `dashboard`, and the Google Contacts sync script.

**Done:** Appended `&directConnection=true` to the working `MONGODB_URI` in
`contacts/.env` and `.env.example`, and to every hardcoded/fallback Mongo
URI found across the repo: `packages/dashboard/src/lib/db.js`, and nine
`beeper-sync`/`beeper-ws`/`beeper-oplog` scripts (`beeper-oplog/index.mjs`,
`beeper-ws/index.mjs`, `beeper-sync/lib/db.mjs`,
`beeper-sync/dedup-messages.mjs`, `beeper-sync/enrich-from-sqlite.mjs`,
`beeper-sync/fix-image-attachments.mjs`, `beeper-sync/enrich-contacts.mjs`,
`beeper-sync/cleanup-ghosts.mjs`, `beeper-sync/cleanup-empty-messages.mjs`,
`beeper-sync/inspect.mjs` — the last of these also had no `MONGODB_URI` env
read at all before this fix and was hardcoded to the old
unauthenticated/non-replicaSet URI). Three scripts
(`fix-contact-dupes.mjs`, `fix-senderid-index.mjs`,
`sync-google-contacts.mjs`) read `process.env.MONGODB_URI` with no
fallback and needed no change.

**Files changed:** `contacts/.env`, `contacts/.env.example`,
`contacts/packages/dashboard/src/lib/db.js`,
`contacts/packages/beeper-oplog/index.mjs`,
`contacts/packages/beeper-ws/index.mjs`,
`contacts/packages/beeper-sync/lib/db.mjs`,
`contacts/packages/beeper-sync/dedup-messages.mjs`,
`contacts/packages/beeper-sync/enrich-from-sqlite.mjs`,
`contacts/packages/beeper-sync/fix-image-attachments.mjs`,
`contacts/packages/beeper-sync/enrich-contacts.mjs`,
`contacts/packages/beeper-sync/cleanup-ghosts.mjs`,
`contacts/packages/beeper-sync/cleanup-empty-messages.mjs`,
`contacts/packages/beeper-sync/inspect.mjs`.

**Tested:** Connected with the real `mongodb` npm driver (from
`packages/beeper-sync`, not just `mongosh`) using the corrected URI —
resolved a primary (`isWritablePrimary: true`, `setName: rs0`) and
successfully listed the existing `beeper` database's collections
(`timeline_events`, `messages`, `sync_state`, `beeper_events`,
`merge_suggestions`, `channels`, `contacts`).

**Status: DONE**

# Task 4 — Full stack verification

**Requested:** Input 1 explicitly said not to run `local_run_all.sh` again
until `local_run_mongodb.sh` was fixed; Input 2 reported that after the
port move, `beeper-ws` and `beeper-oplog` both failed with
`ReplicaSetNoPrimary` when the full stack was last attempted.

**Plan:** Now that Task 3 has fixed the root cause and been verified with a
direct driver connection, run `contacts/03_scripts/local_run_all.sh` and
confirm each step (beeper-sync, beeper-ws, beeper-oplog, dashboard, Google
Contacts sync) actually connects — not just that the pipeline prints a
7/7-style success, since Input 2 called out that exact failure mode
(process started ≠ database connection working).

**Status: NOT DONE — deliberately deferred; only the database-layer fix
was in scope for this Story, running the full stack was left for the user**
