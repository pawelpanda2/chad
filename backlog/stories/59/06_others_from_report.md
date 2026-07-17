# Story 59 — Others from report

## Open decisions the user needs to make before Phase 1 can start

1. **Target database name.** Recommendation: reuse whatever single shared
   chad MongoDB database already exists/is planned for
   `content_provider_files` (per the "one instance, many collections"
   architecture decision), rather than creating a separate `beeper`
   database on the chad side. This avoids migrating the data a second time
   later. Needs a one-line confirmation, not a redesign.
2. **How long to keep `contacts` running in parallel.** Once QNAP test
   (Phase 3) is verified, is `contacts`'s own Mongo kept as a read-only
   safety net for some period, or retired immediately? No strong
   recommendation either way — purely a risk-tolerance call for the user.
3. **Replica-set re-approval timing.** Phase 4 (`beeper-oplog`) is blocked
   on this pre-existing, separately-gated decision. Not re-litigated here,
   but worth the user flagging when/if they want to revisit it, since it
   also affects whether `content_provider_files` itself will ever want
   change streams.

## Why this Story doesn't attempt any implementation

The user was explicit: "zacznij planowac" (start planning), and separately
asked for a new Story specifically to hold "taski i plan potrzebny do
wcielenia tych packagów do repo chad" (the tasks and plan needed to
incorporate these packages into the chad repo) — read as a deliberate
request for a planning artifact, not an instruction to start executing
Phase 1 immediately. Story 58's own closing note already flagged real data
migration as something that "needs a human with real credentials" and
should not be run unattended — that caution still applies to Phase 1 here,
even though Phase 1 targets a local, disposable Mongo rather than QNAP:
running `--apply` for the first time against even a local copy of the
user's real personal message history is exactly the kind of step this repo's
established convention (local → local Docker → QNAP test → QNAP prod, each
gated on explicit approval) says should wait for a explicit go-ahead per
step, not be inferred from "start planning."

## Relationship to Story 58

Story 58 is closed with a scope note pointing here for everything beyond
GUI-level local verification. This Story's Phase 1 Task 2 (local dry-run +
apply) directly continues Story 58's own unfinished Task 8 ("MongoDB
dry-run migration report"), which was explicitly deferred to this Story.

## GUI apps cannot be launched from this session's shell (Task 3)

Confirmed during Task 3: `open -a "Beeper Desktop"` returns exit 0 but no
process ever appears — checked with `ps aux`, `osascript -e 'tell
application "System Events" to get name of every process'` (returns
`false` for `(name of processes) contains "Beeper Desktop"`), and `lsof
-iTCP:23373` (never listening). Tried twice, several seconds apart. This
looks like an environment limitation of the automated shell (no full GUI
session), not an app or config problem — Beeper Desktop is confirmed
installed at `/Applications/Beeper Desktop.app`. Any future session hitting
the same wall on a GUI-only dependency should stop trying to force it via
`open`/`osascript` and instead ask the user to launch the app themselves,
same as this session did (see `04_todos.md`).

## Real bugs found and fixed while re-verifying Task 2's work (Task 3)

Two real, previously-uncaught issues surfaced only because Task 3 re-ran
the full migration cycle instead of trusting Task 2's already-recorded
result:

1. `ensureBeeperIndexes()` had never actually been invoked by anything —
   the migration script only printed a "remember to start something" hint,
   and nothing in the dashboard calls it either. The local target had been
   running for days with only the default `_id_` index on every
   collection. Fixed by having the migration script call it directly after
   `--apply`.
2. `.env.mac-beeper.example`'s QNAP `MONGODB_URI` template pointed at
   database `chad`, not `beeper` — a leftover from before the Task 1
   database-naming decision that was never corrected. Would have silently
   pointed a future QNAP-connected `beeper-ws`/`beeper-sync` at the wrong
   database. Fixed.
