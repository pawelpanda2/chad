# Story 61 — Other notes

## Retroactive Story

This Story was created after the work described in it was already done, in
response to the user explicitly asking to save the bug's solution and the
tasks needed to restore functionality (Input 3). `01_input.md` was
backfilled from the actual conversation history. See `03_story-standard.md`
for why this is the correct way to handle a skipped Story.

## Decisions

- **`directConnection=true` over `rs.reconfig()`.** The user proposed both;
  `directConnection=true` was chosen because it's simpler for a
  single-node local replica set that exists only to enable change streams
  (not real HA/failover), and it avoids a dependency on
  `host.docker.internal` resolving correctly for the mongod process
  connecting to itself on Docker Desktop for Mac — something that would
  have needed its own separate verification.
- **Container recreated, volume preserved.** `contacts`' `mongodb`
  container had to be stopped and removed to be recreated with
  `--replSet`/`--keyFile`, but the named `mongodb_data` volume (the actual
  application data) was never touched, per the user's explicit instruction.
- **Moved to port 27018 rather than stopping the other project's
  container.** Asked the user directly (`AskUserQuestion`) rather than
  guessing, since it affects another active project (`chad` monorepo). The
  user chose to move `contacts` off the default port; this is recorded
  cross-session in the assistant's own memory
  (`project_contacts_mongo_port_27018.md`) so it isn't rediscovered as a
  mystery in a future session.

## Problems encountered

- A first attempt at detecting "does contacts' Mongo already have an admin
  user" used `db.getSiblingDB('admin').getUsers().length`, which is always
  `undefined` (the real shape is `{ users: [...], ok: 1 }`). This caused
  the script to attempt an anonymous `rs.initiate()` against data that
  already had a user, correctly failing with "requires authentication" —
  which looked like a new bug but was actually this detection bug. Fixed
  by using `.getUsers().users.length`.
- `sed`/loop script for bulk-editing the nine `beeper-*` fallback URIs
  initially failed silently (the whole file list ended up passed as one
  invalid path to `sed`) because the interactive shell is `zsh`, which
  doesn't word-split unquoted `$VAR` expansions the way `bash` does. Fixed
  by switching to a real `zsh`/`bash`-compatible array (`FILES=(...)`).
- Docker Desktop for Mac's container-to-host networking (`--network host`)
  doesn't behave like Linux, so an in-container `mongosh` test against
  `localhost:<host-port>` isn't representative of the real Mac-host
  client path; verification instead used `host.docker.internal` from a
  throwaway container, plus a real driver connection run directly on the
  Mac host via `packages/beeper-sync`'s own installed `mongodb` dependency.

## Follow-up proposal (not implemented)

Once `contacts` is migrated into the `chad` monorepo's shared MongoDB
(tracked separately in Story 59), this port-juggling and the
`directConnection=true` workaround become moot — `contacts` would connect
to the same in-network `mongodb` service the `chad` stack already uses,
with no host-port remapping involved at all. No action needed now; noting
it so a future Story doesn't have to rediscover that this Story's fix is
meant to be temporary/local-only.
