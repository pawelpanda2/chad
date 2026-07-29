# Story 92 — Other notes

## Real bugs found and fixed this Story (none were assumed — all caught live)

1. **Beeper Contacts reads broken in Local Mongo mode** (Task 7) — a
   pre-existing lazy-migration call inside a read function
   (`listBeeperContacts`) tripped the write guard. Found by actually
   loading the real page after switching the real Dev Panel, not by
   reading code. Fixed + regression test added.
2. **Mirror status written to the wrong file when run via the official
   LaunchAgent** (Task 8) — a `process.cwd()`-dependent default in a
   shared `dba` module, invisible when testing manually from the repo
   root, real once `system-startup.sh`'s `cd` into `plugins/beeper-synch`
   was in play. Found by comparing the real LaunchAgent's own status
   output against the Dev Panel's live API response and noticing they
   disagreed. Fixed by anchoring to `config.repoRoot`.
3. **Mirror staging-verification race condition** (Task 12) — once real
   sync traffic was flowing, the pre-copy source-count snapshot could go
   stale by the time the multi-second copy finished, since the source is
   a genuinely live target. Found the moment real sync started producing
   real new data mid-copy. Fixed by re-counting the source immediately
   before the final comparison instead of reusing the pre-copy snapshot.

All three are exactly the kind of bug that only surfaces under real,
end-to-end, cross-process verification against a genuinely live system —
none would have been caught by typecheck/build/unit-tests alone, which is
why this Story's checklist insists on distinguishing those from real
PASS.

## Architectural notes

- Confirmed (again, independently from Story 91) that no new QNAP
  container was needed for the mirror — it runs entirely from the Mac via
  `plugins/beeper-synch`, reading QNAP and writing only to the local Mac
  Mongo. QNAP-side responsibilities are unchanged from Story 91.
- The pre-existing Server/Local Mongo switch infrastructure
  (`dev-db-override.ts`, `chad-data-mode.ts`, commit `93a8ae2`) turned out
  to be much more complete than Story 91's own knowledge captured — this
  Story's real value-add was narrower than the prompt implied: build the
  one missing piece (the actual mirror refresh mechanism) and fix the two
  real bugs that surfaced once that piece existed and could be exercised
  end-to-end.

## QNAP TEST deploy

Dashboard/DBA code changed this Story (`beeper-crm.ts`,
`dev-data-source.ts`, `dev-panel-data-source.tsx`,
`app/api/dev-settings/db-source/route.ts`, plus the mid-Story
`app/(dashboard)/dashboard/beeper/page.tsx` tabs change) — not Mac-only,
so per this Story's own default
(`bash-scripts/dashboard/08_registry_test/deploy.sh`) a real TEST deploy
was performed rather than skipped. Note: the Dev Panel's Server/Local
Mongo switch UI is itself local-only (`assertDevOnly()` returns 403
outside `CHAD_ENVIRONMENT=local`), and `isBeeperMongoReadonlyMode()` can
never be true on TEST (no persisted "local" preference exists there) — so
the Task 7 fix is a functional no-op on TEST itself; the deploy was still
warranted because the same compiled `dba`/`dashboard` code ships to TEST
regardless.

**Real result:** `bash-scripts/dashboard/08_registry_test/deploy.sh`
(build on Mac → push `chad-dashboard:260730_005848-2f5dee4` to GHCR → SSH
pull+retag+restart on QNAP) completed cleanly — image tag includes commit
`2f5dee4` confirming the exact right code shipped. Only the
`chad-dashboard-test` container was replaced (stopped/removed/recreated);
`chad-mongodb`/`beeper-mongodb`/`chad-postgres`/`chad-dashboard-prod` were
never touched (confirmed via the script's own log: "Shared services
(mongo) untouched"). Post-deploy: `05_status.sh` showed the container
healthy and responding within seconds.

**Verification method actually used (documented honestly — not a full
login click-through):** no test credentials for `pawel_f` on QNAP TEST
were available to this session, and real production passwords were
deliberately not guessed or searched for. Instead: (1) SSH to QNAP,
`docker exec chad-dashboard-test env | grep BEEPER_MONGODB_URI` confirmed
the container's own configured target is the exact same shared
`beeper-mongodb:27017` service (not a copy); (2) a direct query run *from
inside* that same container, using its own env/credentials via
`docker exec chad-dashboard-test node -e "..."`, returned live counts
(157 contacts / 177 channels / 3691 messages) identical to every other
reader in Task 9's table. This is real evidence of what TEST's dashboard
process itself would read on any authenticated request — just not a
screenshot of a logged-in browser session.

## Follow-ups (not this Story's scope)

- `packages/dba/src/beeper-crm.test.ts` (Story 73's own isolation test)
  currently cannot run at all against the current architecture: its
  documented invocation (`BEEPER_MONGODB_URI=mongodb://...localhost...`)
  now hits `getMongoSource()`'s "qnap" default requiring real QNAP
  credentials, and setting `DBA_MONGO_MODE=local` to route it to a local
  test Mongo now correctly trips the SAME readonly write-guard this
  Story relied on (`assertBeeperWriteAllowed()`), since that test's own
  setup (`dropTestDatabases`, `seedContact`, `ensureBeeperIndexes`) writes
  through `beeper-crm.ts`'s guarded functions. Pre-existing, NOT caused by
  this Story (confirmed: `chad-data-mode.ts` untouched by Story 92; the
  incompatibility exists between commit `93a8ae2`'s readonly-mode
  guard and this older test's assumptions). Worth a small follow-up Story
  to update that test to seed via a raw `MongoClient` (as this Story's own
  new tests do) instead of through the guarded write path.
- `packages/beeper-oplog` QNAP deployment remains a Story 91 follow-up,
  unchanged.
