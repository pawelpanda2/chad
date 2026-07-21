# Story 74 — Others from report

## Root cause of the user's original complaint

The user added a real test change to Daily Tracker (item
`21d11bdc-f1f4-44d1-b61a-3fa6b039c641/07/01/08`, `config.created`/
`config.modified` both `260720_141024` — 2026-07-20 14:10:24) and it never
appeared in History. Confirmed via `docker inspect
chad-history-worker-local-mac-docker --format Created`: the history-worker
container was first created at **2026-07-20T14:43:35** — 33 minutes
*after* the user's write. MongoDB Change Streams only observe events going
forward from when the stream opens (or from a resume token corresponding
to a position already inside the oplog); they are not a retroactive audit
log. Since no resume token existed before the worker's very first start,
this specific gap can never be closed — it is not a bug, it is the correct
and expected behavior of a change-stream-based history system, and it
matches `01_input.md` §17's own explicit tolerance for this case ("Jeżeli
resume token wypadnie poza okno oploga... oznacz lukę w historii"), except
here the gap predates the worker's very first run rather than being a
later oplog-window loss.

Confirmed the pipeline works correctly for every change made *after* the
worker is running, via a full real INSERT/UPDATE/DELETE cycle through the
actual Dashboard UI/API (see `05_tasks_and_checklist.md` Tasks 3–6).

## Architectural decisions

- Kept the general `content-provider/history` API and the Daily-Tracker-
  specific `content-provider/daily-history` convenience wrapper as two
  separate endpoints (both already existed, both call the same `dba`
  function) — this matches `01_input.md`'s own explicit design and is not
  a duplication to be consolidated away.
- Fixed the delete-actor gap in the **worker's cache**, not by adding a
  new `DeleteItemCommand` kind to `data-commands.ts`/threading an actor
  through `MongoCpProvider.deleteItem()`. A change-stream delete event
  never carries `fullDocument`, so even if `deleteItem` set `_lastActor`
  immediately before deleting, the worker would never get to read it —
  the only source of a delete's actor is the worker's own memory of the
  item's last insert/update. This is also arguably more correct in intent
  (the "current attribution model" is inherently "who last touched this
  item", not "who issued the delete call", and the two are usually the
  same person anyway in this single-operator-per-repo app).

## Known limitations (deliberately left as-is)

- **History predating a worker's first start, or any period the worker
  was down for longer than one resume-token restart cycle, is
  unrecoverable** — inherent to change-stream-based history, not fixable
  without a different mechanism (e.g. periodic snapshotting), which is out
  of this Story's scope.
- **Delete's `actor` reflects the last known actor to have written the
  item**, not necessarily literally whoever issued the delete, since
  `deleteDailyEntry`/`MongoCpProvider.deleteItem()` don't currently thread
  an actor through at all (no `DeleteItemCommand`). In this app's current
  single-operator-per-repo model these are the same person in practice.
- **No delete action exists in the Daily Tracker UI itself** — a
  `DELETE /api/forms/daily-entry` endpoint exists and was used directly
  for this Story's testing, but nothing in `views/page.tsx` currently
  calls it. Pre-existing gap, unrelated to Story 74's scope (History), not
  touched.
- **history-worker's diff helpers (`config-diff.mjs`/`body-diff.mjs`) have
  no automated unit tests** — this package has no test runner wired up at
  all (unlike `packages/dba`'s hand-rolled `tsc && node dist/*.test.js`
  convention). Covered instead by this Story's live end-to-end
  verification (real inserts/updates/deletes, inspected in `cp_history`),
  which exercises the same code paths, but a regression in `config-diff.mjs`
  itself wouldn't be caught by any CI-style check today.
- **`packages/dba/src/cp-history.test.ts` requires a manually-supplied
  `MONGODB_URI` pointing at a scratch database** (documented in the file's
  own header) — same pre-existing convention as every other `dba` test
  file, not something this Story changed. From the host machine (outside
  Docker), `?directConnection=true` is required in the URI because `rs0`'s
  configured member hostname (`chad-mongodb-local-mac-docker`) only
  resolves inside the Docker network.

## Fixed along the way (not originally scoped, found during verification)

- **`03_re-start.sh` vs `03_restart.sh` naming regression (repo-wide).**
  `ai-docs/deploy/dashboard-start-scripts.md` already documented, dated
  2026-07-20 (Story 74), that every `03_restart.sh` was deliberately
  renamed to `03_re-start.sh` — the hyphen signals the script handles both
  a first start AND an idempotent restart of an already-running
  environment, not "restart" in the narrow sense of "stop then start
  something already running." A later commit
  (`5cd6017 fix: revert accidental restart.sh -> re-start.sh rename`)
  mistakenly undid this repo-wide, reintroducing `03_restart.sh` as the
  actual filename everywhere while every OTHER doc
  (`dashboard-deployment-scripts.md`, `dashboard-start-scripts.md`) kept
  citing `03_re-start.sh` — and `ai-docs/bash-scripts/conventions.md`
  self-contradicted (its own operation table already said `03_re-start.sh`,
  but its "Nazewnictwo" section explicitly said the opposite: "nie
  `re-start`"). First found this as one broken caller
  (`bash-scripts/dashboard/03_local_mac_docker/06_deploy.sh` calling a
  nonexistent `03_re-start.sh`) and initially "fixed" it by pointing every
  caller at the wrong, regressed name (`03_restart.sh`) instead of
  recognizing the rename itself was the bug — this surfaced for real when
  the user hit `bash: .../03_re-start.sh: No such file or directory`
  running the actual QNAP TEST deploy. Corrected properly: renamed every
  `bash-scripts/dashboard/*/03_restart.sh` back to `03_re-start.sh` (`git
  mv`, preserving history), fixed every caller/comment back to match, and
  fixed `conventions.md`'s self-contradicting section so it can't flip
  again. `grep -rln "03_restart\.sh" bash-scripts/` must stay empty.
- A stray, non-Compose-managed `chad-history-worker-local-mac-docker`
  container (no `com.docker.compose.*` labels — started via a raw `docker
  run`, matching the "Local Development" instructions in the stale
  `ai-docs/deploy/story-74-final-report.md`) was blocking a clean `docker
  compose up`. Stopped and removed it in favor of the one
  `docker-compose.local.yml` already defines, so there is exactly one
  history-worker going forward, managed the same way as every other local
  service.

## Follow-up proposals (not implemented — future work)

- Wire a real delete action into the Daily Tracker Views UI (the backend
  endpoint already exists and was proven working by this Story).
- Consider a lightweight test runner for `packages/history-worker` (even
  just `node --test`) so `config-diff.mjs`/`body-diff.mjs` get direct unit
  coverage instead of relying entirely on live end-to-end verification.
- If literal delete-actor attribution (not "last writer") ever becomes
  important, add a `DeleteItemCommand` to `data-commands.ts` and thread
  `tryGetCurrentActor()` through `deleteDailyEntry` → `MongoCpProvider`,
  writing it into a short-lived side collection the worker can consult for
  delete events (the "krótkotrwałe metadata operacji" option `01_input.md`
  §15 itself lists as an alternative to the cache-based approach used
  here).
