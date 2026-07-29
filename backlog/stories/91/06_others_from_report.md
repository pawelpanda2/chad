# Story 91 — Other notes

## Architectural decisions

- **No new QNAP container for Beeper sync.** See Task 7 in
  `05_tasks_and_checklist.md` and `02_plan.md`. The Mac already writes
  directly to `beeper-mongodb` over Tailscale (verified for real) — a
  QNAP-side "sync" container would duplicate that write path for no
  benefit and risk two writers touching the same collections.
- **`plugins/` added as its own top-level workspace category**, distinct
  from `packages/` (shared libraries/apps consumed by more than one thing)
  and `bash-scripts/` (plain shell). `pnpm-workspace.yaml` gained a
  `plugins/*` glob.
- **`.env.mac-beeper` cutover to QNAP** (Task 5) is a real behavior change
  for `beeper-ws`/`beeper-sync` too, not just `beeper-synch` — they now
  target the real per-user database on `beeper-mongodb` instead of a
  stale/broken local target. This was necessary (the local target
  literally couldn't authenticate) and is exactly what this Story's stated
  goal requires, but is worth flagging explicitly since it affects the two
  pre-existing packages' runtime behavior, not just the new plugin.

## Follow-up proposals (not implemented this Story)

- **Deploy `packages/beeper-oplog` to the QNAP shared stack**, once it
  supports either (a) one container instance per CHAD user
  (`BEEPER_OWNER_REPO_GUID` set per container) or (b) a code change to
  iterate every `beeper_<repoGuid>` database it finds. Today it is
  single-owner-per-process and has never been deployed anywhere — deploying
  it as-is for `pawel_f` only would look like "the pipeline is complete"
  while silently leaving `kamil_s` (and any future user) unmaterialized.
  This is the one piece of the full Beeper pipeline (raw `beeper_events` ->
  normalized `contacts`/`channels`/`messages`) that could legitimately run
  QNAP-side without Beeper Desktop — see Task 7.
- `packages/beeper-sync`'s own `--sqlite`/`enrich`/`dedup`/cleanup one-off
  scripts are out of scope for `beeper-synch`'s periodic loop (they're
  manual/rare operations, not part of the continuous incremental flow) —
  left as manual `bash-scripts/beeper/05_sync.sh --sqlite` etc., unchanged.
- Task 8 in the checklist (full live incremental-sync/Include-Exclude smoke
  test) needs the owner to open Beeper Desktop and let `beeper-synch` run
  for a few sync intervals, then check `.runtime/beeper-synch/status.json`
  and the real `beeper_<repoGuid>` collections for duplicate-free growth.

## QNAP TEST deploy

Not performed. Nothing in this Story changes any container image, Next.js
route, or Dashboard-facing behavior — `beeper-synch` is a Mac-only process
with no server-side deployable artifact (per the Task 7 decision), so there
is nothing to build/push/deploy to QNAP TEST for this Story. The
`.env.mac-beeper` cutover (Task 5) only affects the Mac's own env file
(gitignored, never deployed).
