# Story 58 — Tasks Checklist

| # | Ai Status | Real Status | Task |
|---|-----------|-------------|------|
| 1 | NOT DONE  |             | Local Beeper dashboard stack (Mongo + Content Provider + dashboard) runs locally and is reachable in a browser |
| 2 | NOT DONE  |             | Beeper contacts list view works when clicked through locally (tag tabs, search, count) |
| 3 | NOT DONE  |             | Beeper contact detail view works locally (profile, timeline, tags, merge dialog, export) |
| 4 | NOT DONE  |             | Beeper inbox view works locally |
| 5 | NOT DONE  |             | Beeper merge-suggestions view works locally |
| 6 | NOT DONE  |             | Mongo data migration dry-run produces a counts/duplicates/conflicts/indexes report (real `contacts` source → local `chad` target) |
| 7 | NOT DONE  |             | `beeper-ws` / `beeper-sync` connect to a real, locally running Beeper Desktop and pull/log a small real sample |
| 8 | NOT DONE  |             | Attachments show a graceful "media unavailable" placeholder instead of breaking (first-version scope, no central storage) |

# Task 1 — Local Beeper dashboard stack runs locally

**Requested:** Start the local stack (MongoDB, Content Provider API,
dashboard) using existing scripts, without asking again for permission to
run it locally.
**Done:** In progress — added `MONGODB_URI` to root `.env.local` (was
missing entirely; `packages/dashboard`'s Next.js dev server picks it up via
`02_local_mac_tmux/02_start.sh` exporting `.env.local` into the shell before
launching tmuxinator). Local Mongo/Content Provider/dashboard containers and
processes not started yet at the time this file was first written.
**Files changed:** `.env.local` (gitignored, not committed).
**Tested:** Not yet.
**Status: NOT DONE**

# Task 2 — Beeper contacts list view

**Requested:** Real browser click-through of `/dashboard/beeper` (tabs,
search, count).
**Done:** Not started — blocked behind Task 1.
**Files changed:** —
**Tested:** —
**Status: NOT DONE**

# Task 3 — Beeper contact detail view

**Requested:** Real browser click-through of `/dashboard/beeper/[id]`
(profile, timeline, tags, merge dialog, export button).
**Done:** Not started — blocked behind Task 1.
**Files changed:** —
**Tested:** —
**Status: NOT DONE**

# Task 4 — Beeper inbox view

**Requested:** Real browser click-through of `/dashboard/beeper/inbox`.
**Done:** Not started — blocked behind Task 1.
**Files changed:** —
**Tested:** —
**Status: NOT DONE**

# Task 5 — Beeper merge-suggestions view

**Requested:** Real browser click-through of `/dashboard/beeper/merge`.
**Done:** Not started — blocked behind Task 1.
**Files changed:** —
**Tested:** —
**Status: NOT DONE**

# Task 6 — Mongo migration dry-run report

**Requested:** Run `bash-scripts/mongo/migrate-contacts-to-chad.mjs`
dry-run against the real `contacts` source and the local `chad` target;
derive connection info from existing config, not by asking again; report
counts/duplicates/conflicts/indexes; never write for real without an
explicit go-ahead after the dry-run.
**Done:** Not started yet.
**Files changed:** —
**Tested:** —
**Status: NOT DONE**

# Task 7 — beeper-ws / beeper-sync against real Beeper Desktop

**Requested:** Confirm Beeper Desktop is reachable, existing scripts start
without changes, and a small real sample can be pulled/logged safely (no
full history import without dry-run/idempotency confirmation).
**Done:** Not started yet.
**Files changed:** —
**Tested:** —
**Status: NOT DONE**

# Task 8 — "Media unavailable" placeholder for attachments

**Requested:** First-version scope for attachments: show text messages,
show attachment metadata if present, show a "media unavailable" placeholder
if the file can't actually be fetched — no central storage, no binary
transfer.
**Done:** Not started yet.
**Files changed:** —
**Tested:** —
**Status: NOT DONE**
