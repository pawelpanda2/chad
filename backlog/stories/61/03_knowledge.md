# Story 61 — Knowledge

Pointers and gotchas discovered while fixing `contacts`' local MongoDB
setup. Scoped to this Story; anything below that turns out to matter beyond
it should be promoted into `documentation/ai-docs/knowledge/`.

- **`contacts/03_scripts/local_run_mongodb.sh`** is the script that creates/
  starts the project's `mongodb` Docker container. Before this Story it ran
  plain `mongod` with no `--replSet`, so `rs.initiate()` always failed with
  "This node was not started with replication enabled" even though
  `db.hello()` misleadingly showed `isWritablePrimary: true` (that field
  just means "this standalone node accepts writes", not "a replica set is
  running" — it doesn't imply `setName` is present).

- **`--keyFile` + `--replSet` + auth**: once auth is enabled, a replica set
  (even single-node) requires a keyFile for internal cluster
  authentication, or mongod refuses to start. The keyFile was generated
  once (`head -c 756 /dev/urandom | base64`) into its own named Docker
  volume (`mongodb_keyfile`), created via a throwaway `mongo:8` container
  run as root so the file ends up owned by uid/gid `999:999` (the image's
  `mongodb` user) — a host bind-mount would have needed the *host* file to
  already be owned by that numeric uid, which doesn't map cleanly from
  macOS.

- **The Mongo localhost exception only covers user-management commands and
  only while zero users exist system-wide.** In this project's actual data
  (the `mongodb_data` volume was deliberately preserved across the
  container recreation), an `admin` user already existed from a previous
  run, so the exception was already closed — `rs.initiate()` had to run
  authenticated (`-u admin -p admin123 --authenticationDatabase admin`),
  not anonymously. The fix script now checks for an existing user first
  and picks the authenticated vs. anonymous path accordingly, rather than
  assuming a fresh install.

- **`db.getSiblingDB('admin').getUsers()` returns `{ users: [...], ok: 1 }`,
  not a bare array.** A first attempt at detecting "does an admin user
  already exist" used `.getUsers().length`, which is silently `undefined`
  on that shape and broke the authenticated-vs-anonymous branch above. The
  correct accessor is `.getUsers().users.length`.

- **Host port 27017 is already owned locally by `chad-mongodb-local-mac-docker`**
  (part of the [[chad_monorepo_migration]] stack, `restart: unless-stopped`).
  It re-claims 27017 automatically the instant it's free, so `contacts`'
  own mongo container now publishes on host port **27018** instead
  (mongod inside the container still listens on the standard 27017 — only
  the host-side publish port changed). See the persistent memory note
  `project_contacts_mongo_port_27018.md` for the cross-session version of
  this fact.

- **A replica set member's advertised host is independent of the Docker
  host-port mapping.** `rs.conf()`/`rs.status()` record whatever address
  was passed to `rs.initiate()` (here: `localhost:27017`, the in-container
  port). A MongoDB driver doing normal SDAM topology discovery connects to
  the seed address in the URI, reads the replica set config, and then
  tries to open connections to the *advertised* member address — which, on
  a host where the container's port is remapped (27018 externally),
  doesn't match and can even resolve to a completely different project's
  container. This produced `ReplicaSetNoPrimary` / `servers: Map(0) {}`
  even though the replica set itself was healthy.

- **`directConnection=true` fixes it for a single local node**: it tells
  the driver to trust the exact host:port in the URI as-is and skip
  replica-set topology discovery/hopping entirely. Confirmed working with
  the real `mongodb` npm driver (not just `mongosh`), connecting to
  `mongodb://admin:admin123@localhost:27018/beeper?authSource=admin&replicaSet=rs0&directConnection=true`
  and reading the existing `beeper` database's collections. The
  alternative the user also proposed — `rs.reconfig()` to advertise
  `host.docker.internal:27018` — was not applied; `directConnection=true`
  was judged simpler and avoids depending on `host.docker.internal`
  resolving correctly for the mongod process connecting to itself, which
  would need separate verification on Docker Desktop for Mac.

- **zsh does not word-split unquoted `$VAR` expansions** the way bash does
  (no `SH_WORD_SPLIT` by default). A `for f in $FILES` loop with `FILES` as
  a plain space-separated string silently iterated zero times and passed
  the whole string as one argument to `sed`/`grep`. Fixed by using a real
  shell array (`FILES=(...)`, `"${FILES[@]}"`).

- Every place in `contacts` that builds a Mongo connection string was
  touched, not just `.env`: `packages/dashboard/src/lib/db.js`'s fallback
  default, and hardcoded/fallback URIs in nine `beeper-sync`/`beeper-ws`/
  `beeper-oplog` scripts (`index.mjs` ×2, `lib/db.mjs`,
  `dedup-messages.mjs`, `enrich-from-sqlite.mjs`,
  `fix-image-attachments.mjs`, `enrich-contacts.mjs`, `cleanup-ghosts.mjs`,
  `cleanup-empty-messages.mjs`, `inspect.mjs`). Three scripts
  (`fix-contact-dupes.mjs`, `fix-senderid-index.mjs`,
  `sync-google-contacts.mjs`) read `process.env.MONGODB_URI` with no
  fallback at all and needed no change — they inherit the corrected value
  from `.env` via the shell scripts that source it.
