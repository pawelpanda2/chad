# Story 74 — Knowledge

Pointers to what this Story actually needed, and why. See
`ai-docs/history/how-it-works.md` (written as part of this Story) for the
full architecture write-up — this file is just the map of what mattered
and where to find it, not a repeat of that content.

## Pipeline (confirmed against real code + real local data, not assumed)

```
Dashboard UI/API (packages/dashboard/app/api/forms/daily-entry, .../history)
  -> dba (packages/dba/src/leads.ts: saveDailyEntry/updateDailyEntry/deleteDailyEntry)
  -> repo-context.ts (tryGetCurrentActor — stamps username/repoGuid onto the DataWriteCommand)
  -> data-commands.ts (buildPutItemCommand / buildCreateChildItemCommand)
  -> data-router-instance.ts / data-router.ts (DbaDataRouter — routes to the active provider)
  -> data-providers/mongo-cp-provider.ts (putItem/createChild write `_lastActor` onto the cp_items doc;
     deleteItem does NOT — see the delete-actor bug below)
  -> chad.cp_items (MongoDB, replica set rs0)
  -> MongoDB Change Stream (itemsCol.watch(), packages/history-worker/index.mjs)
  -> chad.cp_history / chad.cp_history_state
  -> packages/dba/src/cp-history.ts (listCpHistory / getCpHistoryEntry / listDailyTrackerHistory)
  -> packages/dashboard/app/api/content-provider/{history,daily-history}
  -> packages/dashboard/app/(dashboard)/dashboard/history/page.tsx
```

## Address format (verified against real local `cp_items`, not the input prompt's hypothetical)

Real addresses use `/` as the segment separator (`repoGuid/04/02/84`), not
`-`. `cp-history.ts`'s `repoAddressFilter()` regex (`^repoGuid(/|$)`) was
already correct — Story 74's own input flagged this as something to
*check*, not a known bug, and the check confirmed no bug existed here.
Covered by a regression test anyway
(`cp-history.test.ts`: "does not match a repo whose GUID is a
string-prefix of another repo's GUID").

## repoGuid <-> username mapping (easy to get backwards, cost real debugging time)

`chad_kamil_s`'s repo root address is `8b603669-f8e6-4224-bd78-a474998995fa`;
`chad_pawel_f`'s is `21d11bdc-f1f4-44d1-b61a-3fa6b039c641`. These are **not**
derivable from the GUID text — confirm via
`db.cp_items.findOne({config.address: <bare-guid>})`'s `config.name` field
(`chad_<username>`) before assuming which repo belongs to which user.

## MongoDB 4.4 has no pre/post-images

`fullDocumentBeforeChange`/`updateLookup`-for-deletes are 6.0+ features.
The worker's in-memory `lastKnownState` cache (keyed by `_id`, populated
progressively from events it has actually seen since its own last start)
is the only source of "before" state — deliberately not bootstrapped from
a full `cp_items` scan at startup (would make catch-up-after-downtime
diffs subtly wrong by mixing "state before this worker ever ran" into a
diff). First event for any item after a (re)start is honestly marked
`beforeUnknown: true`, not fabricated.

## Docker images vs. source tree can silently diverge

`docker-compose.local.yml`'s dashboard/history-worker services build from
a `Dockerfile`, and `docker compose up` only recreates a container if it
detects the referenced image actually changed. Checking file mtimes and
`git diff` on the source tree says nothing about whether the *running
container* reflects them — always cross-check `docker images` timestamps
and `docker inspect <container> --format Created` against source mtimes
before trusting a live symptom (or its absence) as evidence about current
code. This Story's dashboard container was running an image built ~2
hours before several of the uncommitted source edits it was supposed to
contain.

## `docker start` vs. `docker compose up -d` after rebuilding an image

`docker stop && docker start` reuses the *existing* container and its
already-baked-in image layer — it does **not** pick up a freshly built
image even with the same tag. Only recreating the container (`docker
compose up -d <service>`, which diffs image IDs) does. Cost real time in
this Story: the delete-actor fix appeared to not work on the first restart
attempt purely because of this.

## Story 74's own docs referenced a document that never existed

`ai-docs/deploy/story-74-final-report.md` (found as an untracked file,
presumably written by Copilot or Cline) claimed completion and referenced
`ai-docs/history/how-it-works.md` as already written — it did not exist.
Treat any prior agent's own "final report" as a claim to verify, not a
source of truth, especially about what documentation/tests already exist.
