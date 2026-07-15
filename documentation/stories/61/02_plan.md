# Story 61 — Plan

**Note:** this Story was created retroactively, after the work was already
done (see `03_story-standard.md` — "If you notice mid-task (or after
finishing) that you skipped this"). Input 1 and Input 2 were live bug
reports with the user's own root-cause diagnosis already attached; each was
handled as reactive, single-session debugging rather than through an
up-front approved plan. This file records, after the fact, the approach
actually taken for each Input — there was no separate plan presented for
approval before implementation started.

## Approach for Input 1 (replica set not enabled)

1. Confirm the user's diagnosis with `docker inspect mongodb` (Cmd had no
   `--replSet`, data lived on the named volume `mongodb_data`).
2. Rewrite `contacts/03_scripts/local_run_mongodb.sh` so the container is
   created with `mongod --replSet rs0 --bind_ip_all --keyFile <path>`,
   generating the keyFile once into its own Docker volume (not a host
   bind-mount, to sidestep UID/permission mismatches between macOS and the
   container's `mongodb` user).
3. Detect an existing container that lacks `--replSet` and transparently
   recreate it, explicitly preserving the `mongodb_data` volume per the
   user's instruction not to delete it.
4. Handle both possible states after recreation: a brand-new data volume
   (no admin user yet, use the localhost exception for the first
   `rs.initiate()` + `createUser`) and this project's actual state (an
   admin user already existed in the preserved volume, so `rs.initiate()`
   had to run authenticated).
5. Wait for `isWritablePrimary: true` + `setName: 'rs0'` before declaring
   success, per the user's explicit acceptance criteria.
6. Do **not** run `local_run_all.sh`, per the user's explicit instruction,
   until the above was confirmed.

## Approach for Input 2 (ReplicaSetNoPrimary after the port move)

1. Confirm the user's diagnosis with `rs.conf()` — the single member was
   registered as `localhost:27017` (the in-container port), not
   `localhost:27018` (the host-published port chosen in Input 1 to avoid a
   collision with the `chad` monorepo's own `chad-mongodb-local-mac-docker`
   container).
2. Evaluate the user's two proposed fixes (`rs.reconfig` to
   `host.docker.internal:27018`, vs. appending `directConnection=true` to
   every connection string) and pick `directConnection=true` — simpler and
   more robust for a single local node used only to enable change streams,
   and avoids depending on Docker Desktop's `host.docker.internal`
   resolution behaving the same way for the mongod process talking to
   itself as for the host-side client.
3. Apply `directConnection=true` consistently everywhere a Mongo URI is
   built in the `contacts` repo, per the user's explicit list
   (`.env`/`.env.example`, `beeper-sync`, `beeper-ws`, `beeper-oplog`,
   `dashboard`, Google Contacts sync), including scripts with a hardcoded
   fallback default and not just the primary `.env`-driven path.
4. Verify with the actual `mongodb` Node.js driver (not just `mongosh`)
   that a client connecting through the new URI resolves a primary and can
   read existing collections, since Input 2's core complaint was that a
   previous "fixed" state had silently misled the user via a false-success
   pipeline result.
