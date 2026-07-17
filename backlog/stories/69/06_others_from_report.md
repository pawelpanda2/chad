# Story 69 — Others from report

## Open decisions the user needs to make before Etap 2 proceeds

1. **How does the migration process (and later, Mac beeper-ws/beeper-sync)
   actually reach QNAP's Mongo?** Port 27017 isn't published to the host.
   Three options, no strong recommendation either way since this is a
   security/architecture tradeoff, not a pure engineering one:
   - **(a) Run on the QNAP host directly (via SSH)** for the migration
     script — simplest, zero network/compose changes, but doesn't solve
     Etap 7 (Mac-side beeper-ws/beeper-sync need to reach it from the Mac,
     not from the QNAP host itself).
   - **(b) Temporarily publish 27017**, run the migration from the Mac,
     then remove the port mapping again — solves Etap 3 without a
     permanent exposure change, but still doesn't solve Etap 7 alone.
   - **(c) Permanently publish 27017, scoped to the Tailscale interface**
     (e.g. `100.117.139.83:27017:27017` instead of `0.0.0.0:27017:27017`)
     — solves both Etap 3 and Etap 7 in one change, matches the
     already-written `.env.mac-beeper.example` QNAP form (which assumes
     Tailscale-reachable Mongo), but is a docker-compose change to a
     shared, currently-running service (`docker-compose.qnap.shared.yml`)
     that both TEST and PROD depend on — needs a restart of the shared
     Mongo/CP stack to take effect, however briefly.

2. **Confirmed but worth a conscious yes**: since TEST and PROD share one
   Mongo, applying the migration effectively puts Beeper data on the same
   database PROD's dashboard *could* read from if ever wired up. Nothing
   about this Story wires PROD's dashboard to read it, but the data itself
   is no longer test-only at the storage layer the moment Etap 4 applies.
   If the user wants genuine data isolation between "QNAP TEST" and "QNAP
   PROD" for Beeper specifically (different from how the rest of chad's
   data already works), that would be a bigger, separate architectural
   change — not attempted here without being asked.

## Why this Story stopped after Etap 1 instead of continuing straight through

The user's own prompt is explicit that data safety is the top priority and
every step must be reversible — and separately says to STOP if anything
about the target looks suspicious or there's overwrite risk. The target
itself came back clean (empty, no collision) but the *audit surfaced two
real unknowns that change how Etap 2 onward should be executed* — not
risks to the data, but decisions about network exposure and
TEST/PROD data-sharing that are the user's call, not something to guess at
before touching a shared, remote, already-live environment for the first
time with this feature. Continuing to Etap 2 (backup) without resolving
item 1 above isn't itself risky, but Etap 3 (dry-run) needs a concrete
connection method, so raising it now avoids re-doing work.
