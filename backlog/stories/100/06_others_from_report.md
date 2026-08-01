# Story 100 — Other notes

## This Story was created retroactively

The investigation and fix were carried out directly in conversation before
this folder existed, contrary to `ai-docs/begin_here/03_story-standard.md`'s
"create the Story before reading code" rule. Backfilled immediately after
finishing, as faithfully as possible, per that same doc's own guidance
("a late Story is far better than no Story").

## Concurrent parallel work on this repo — nothing else touched

`git status --short` at the time of this Story showed a large number of
**pre-existing, unrelated modified files** across `packages/dashboard`,
`packages/dba`, `ai-docs/`, `human-docs/`, `bash-scripts/dashboard/`,
`vitest.config.mjs`, plus an untracked `ai-docs/msg-workout/` directory —
none of these were touched, read in depth, or attributed to this Story.
This matches the known pattern that this repo has concurrent Claude Code
sessions running on the same working directory (memory:
`feedback_parallel_sessions_same_working_dir`) — very likely other active
work on Story 99 ("integracja msg workout z Beeper Conversations") or
similar. **No commit was made** in this Story — the user did not ask for
one, and committing would have required carefully separating this Story's
6 files from that unrelated in-progress work, which wasn't requested.

Files actually changed by this Story:

- `packages/beeper-oplog/index.mjs` (index bug fix)
- `plugins/beeper-synch/src/config.ts`
- `plugins/beeper-synch/src/index.ts`
- `plugins/beeper-synch/src/config.test.ts`
- `plugins/beeper-synch/README.md`
- `plugins/beeper-synch/package.json`
- `backlog/stories/100/*` (this Story)

## Follow-ups (not this Story's scope)

- **Real full-reboot verification of `RunAtLoad`** — ask the user before
  performing (see Task 7). A natural moment would be the next time they
  restart the Mac anyway for an unrelated reason; afterward, run
  `bash-scripts/beeper-synch/status.sh` and confirm `beeper-ws`/
  `beeper-oplog`/`beeper-sync` are all `running: true` without any manual
  `install-startup.sh`/`restart.sh` call.
- **`beeper-sync`'s periodic scheduling is now mostly redundant** for its
  originally-implied purpose (catching new messages) — it still has real
  value as a safety net for channels that haven't finished their initial
  backfill (new chats, or if `beeper-oplog` were ever down for a while and
  a channel fell far enough behind that a full re-verify is wanted via
  `--force`), but the default 5-minute schedule mostly produces "already
  synced, skipping" log noise now that `beeper-oplog` is the real
  continuous path. Not changed in this Story (out of scope, and the noise
  is harmless) — worth a small follow-up if the log volume becomes
  annoying (e.g. widen the interval, or skip the log line for the
  already-synced case in a way that doesn't hide the interval it's still
  useful for: fully-synced-channel silence + genuinely-new-channel
  discovery).
- `packages/beeper-oplog/package.json`'s own `description` field still
  says "NOT deployed yet" — should be updated now that it is, in whatever
  follow-up touches that package next (left as-is here since this Story
  didn't want to hand-edit an unrelated metadata field mid-incident-fix
  without also re-verifying the rest of that file).
