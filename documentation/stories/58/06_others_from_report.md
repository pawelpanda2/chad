# Story 58 — Others from report

## `beeper-oplog` — explicitly deferred, not a blocker

Per Input 1 §2: `beeper-oplog` needs a MongoDB replica set (for change
streams), which is a separate, already-gated decision from an earlier
phase of the contacts migration (see the `chad_monorepo_migration` memory
file and `documentation/beeper/architecture.md`). This Story does **not**
attempt to unblock it and does **not** touch QNAP MongoDB configuration.
`beeper-oplog` stays out of this Story's runtime-verification scope; the
dashboard, its API routes, `beeper-ws`, and `beeper-sync` do not depend on
it.

## Deferred features (not blockers for this Story)

Per Input 1 §4, restating what `documentation/beeper/migration.md` already
records: `/affinity` view, avatar cropper UI, and Google-Contacts-enrich
merge suggestions remain unported. Schema-compatible, can be added later
without data-layer changes. Not part of this Story.

## Known limitation found while starting local testing

Real browser login for click-through testing needs a valid
`chad_admin/users-list` username/password. The local Content Provider
stack (`bash-scripts/content-provider/run-content-provider-if-needed.sh`)
does mount real data from `/Users/pawelfluder/Dropbox`, and a real
`users-list` item exists there — but its `passwordHash` field is
bcrypt-hashed and not recoverable from disk. This is the one piece of
information Input 1's own stop conditions call out explicitly ("nie da się
ustalić brakującej informacji z kodu, dokumentacji ani istniejących
envów") — resolving it needs either real test credentials from the user, or
explicit permission to add a disposable local-only test user to the local
`chad_admin/users-list` data. Everything else in this Story proceeds
without waiting on this.

## Stale `mongo:up` script

See `04_todos.md` — root `package.json`'s `mongo:up` doesn't pass
`-f docker-compose.local.yml`, so it fails as written. To be triaged
(fixed here, or promoted permanently to this section) by the time this
Story closes.
