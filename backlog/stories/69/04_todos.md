# Story 69 — Todos (working scratchpad)

1. **Decide how the migration/beeper-ws/beeper-sync processes actually
   reach QNAP's Mongo**, since port 27017 is not published to the host —
   only reachable inside the `chad-shared` Docker network or via `docker
   exec` on the QNAP host itself. Options: (a) run the migration script
   directly on the QNAP host via SSH (simplest, no compose/network
   changes), (b) temporarily publish 27017 for the migration then close it
   again, (c) permanently publish 27017 scoped to the Tailscale interface
   only (needed anyway for Etap 7's Mac-side beeper-ws/beeper-sync to
   reach it "over Tailscale" as the user's prompt specifies). Needs a
   decision before Etap 3 can run — this is a concrete architecture
   question, not just an execution detail, so surfaced to the user rather
   than picked unilaterally.
2. Push local commits (`074f672`, `7ef411f`) so QNAP's `git pull` picks up
   the SSE fix and the migrator's auto-index-creation before Etap 6's
   rebuild.
