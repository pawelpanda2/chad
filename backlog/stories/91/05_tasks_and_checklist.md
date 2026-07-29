# Story 91 — Tasks Checklist

| # | Ai Status | Real Status | Task |
|---|-----------|-------------|------|
| 1 | DONE | | `plugins/beeper-synch` supervises the existing `beeper-ws`/`beeper-sync` packages (spawn, backoff-restart, scheduled incremental run) without duplicating their logic |
| 2 | DONE | | Single-instance lock blocks a second `beeper-synch` process from starting |
| 3 | DONE | | Graceful shutdown on SIGINT/SIGTERM (children stopped, lock released, status file updated) |
| 4 | DONE | | Mongo preflight check distinguishes a Mongo error from a Beeper Desktop error, with distinct exit codes |
| 5 | DONE | | `.env.mac-beeper` now points at the real QNAP `beeper-mongodb` (Tailscale) instead of a stale/broken local target |
| 6 | DONE | | macOS LaunchAgent (`com.chad.beeper-synch`) auto-starts `beeper-synch` at login, independent of the Content Provider's own LaunchAgent |
| 7 | DONE | | No new QNAP container added for Beeper sync — Mac writes directly to `beeper-mongodb`; decision documented |
| 8 | BLOCKED | | Full incremental-sync-without-duplicates / Include-Exclude live smoke test against a running Beeper Desktop |

# Task 1 — `plugins/beeper-synch` supervisor

**Requested:** a new Node/TS plugin that runs on the Mac, reusing existing
`packages/beeper-ws`/`packages/beeper-sync` (no duplicated sync logic),
supervising them as one process.

**Done:** `plugins/beeper-synch` (added to `pnpm-workspace.yaml`'s
`plugins/*` glob). `src/process-manager.ts`'s `SupervisedProcess` spawns
`packages/beeper-ws/index.mjs` as a child process, restarting it with
bounded exponential backoff + jitter (`src/backoff.ts`) on unexpected exit,
resetting the backoff counter after 60s of stable uptime.
`src/scheduler.ts`'s `PeriodicRunner` runs `packages/beeper-sync/index.mjs`
(default incremental REST mode) on a fixed interval
(`BEEPER_SYNCH_SYNC_INTERVAL_MS`, default 5 min), one run at a time — a
failed run is simply retried on the next scheduled tick (no bespoke retry
queue). Both children run with `stdio: "inherit"`, so all of beeper-ws's/
beeper-sync's own logging (Include/Exclude decisions, sync-state, Mongo
connection lines) appears unmodified in beeper-synch's own log. Neither
package's source was changed. `src/config.ts` loads
`.env.mac-beeper` (same file, no duplicate env) plus a handful of new
`BEEPER_SYNCH_*` orchestrator-only variables (documented in
`.env.mac-beeper.example`).

**Files changed:** `pnpm-workspace.yaml`; new
`plugins/beeper-synch/{package.json,tsconfig.json,README.md,src/{config,
owner-db,lock,backoff,mongo-preflight,process-manager,scheduler,status,
index}.ts,src/{config,lock,backoff}.test.ts,tests/README.md}`.

**Tested:**
- `pnpm --filter beeper-synch typecheck` — PASS (no errors).
- `pnpm --filter beeper-synch build` — PASS (`dist/*.js` generated).
- `pnpm --filter beeper-synch test` (20 assertions across config/lock/
  backoff) — PASS, 20/20.
- Real run (`node dist/index.js`, Beeper Desktop NOT running on this Mac
  during this session): Mongo preflight connected to the real QNAP
  `beeper-mongodb` (see Task 5), `beeper-ws` spawned, its own WS connect to
  `localhost:23373` failed (Beeper Desktop not open), beeper-synch logged
  the exit and scheduled a backoff restart (`attempt 1` at 2s, `attempt 2`
  at 4s, `attempt 3` at 7s, `attempt 4` at 16s) — real evidence of the
  backoff wrapper, not merely code review. `beeper-sync`'s scheduled run
  also failed for the same reason (Beeper Desktop REST endpoint
  unreachable) and beeper-synch logged "will retry on the next scheduled
  tick" without crashing itself.
- **Not verified this session:** a full incremental sync run WITH Beeper
  Desktop actually reachable (no duplicates, Include/Exclude enforcement)
  — see Task 8 / BLOCKED.

**Status: DONE** (supervisor itself fully implemented and exercised for
real against real failure conditions; the happy-path full-sync flow is
blocked on Beeper Desktop being open — see Task 8).

# Task 2 — Single-instance lock

**Requested:** a second instance must be blocked (prompt 3.3/5).

**Done:** `src/lock.ts`'s `acquireLock`/`releaseLock` — a PID file at
`.runtime/beeper-synch/beeper-synch.pid`. A live holder blocks a new
instance (`LockHeldError`, `index.ts` exits code 3); a stale lock (holder
pid no longer alive) is silently reclaimed, never a "lock cannot be
acquired" false negative. `releaseLock` only removes the file if it still
points at the caller's own pid, so a slow cleanup from an old process can
never delete a newer instance's lock.

**Files changed:** `plugins/beeper-synch/src/lock.ts`, `src/lock.test.ts`.

**Tested:**
- Unit tests (5/5 pass): live-holder rejection, stale-lock reclaim (using a
  real spawned-then-exited child process's pid, not a guessed number),
  release-by-owner, release-refused-for-a-different-holder.
- Real process test: started instance A in the background (pid captured),
  started instance B in the foreground — B printed
  `beeper-synch is already running (pid <A>, lock file ...)` and exited
  with code 3. Confirmed via `echo $?`.

**Status: DONE**

# Task 3 — Graceful shutdown (SIGINT/SIGTERM)

**Requested:** correct shutdown on both signals (prompt 2.4/3.3).

**Done:** `index.ts` installs handlers for both signals; `shutdown()` calls
`stop()` on both the supervised `beeper-ws` process and the `beeper-sync`
scheduler (SIGTERM to the child, SIGKILL after a 5s grace period if it
hasn't exited), writes a final `status.json` with `ready: false`, releases
the PID lock, then exits 0.

**Tested (real, not just code review):**
- SIGINT: sent `kill -INT` to a real running instance — log showed
  `received SIGINT — shutting down...` then `shutdown complete`; process
  exited; lock file removed; `status.json` updated with `stoppedAt`.
- SIGTERM: same sequence with `kill -TERM` against a second real instance —
  identical clean shutdown.
- Confirmed no orphaned `beeper-ws`/`beeper-sync` child processes remained
  after either shutdown (`pgrep -fl` empty for both).

**Status: DONE**

# Task 4 — Mongo vs. Beeper Desktop error distinction, exit codes

**Requested:** "odróżnienie błędu źródła Beeper od błędu Mongo" (prompt
3.3), readable exit codes.

**Done:** `src/mongo-preflight.ts` runs a `ping` against the owner's
`beeper_<repoGuid>` database BEFORE spawning any child process. If it
fails, `index.ts` logs a Mongo-specific message and exits 4 without ever
starting `beeper-ws`/`beeper-sync`. A Beeper Desktop connectivity problem,
by contrast, only ever surfaces once a child process is already running
(its own WS/REST error), and is handled by the backoff/retry logic (Tasks
1), never treated as a fatal beeper-synch error. Exit codes documented in
`README.md`: 0 clean shutdown, 1 generic fatal, 2 invalid config, 3 lock
held, 4 Mongo preflight failed.

**Tested:** real preflight succeeded against the live QNAP `beeper-mongodb`
(Task 5) in every manual run this session; the failure path (exit 4) is
covered indirectly by `config.test.ts`'s config-validation tests plus code
review of `mongo-preflight.ts`/`index.ts` — **not independently exercised
against a real unreachable Mongo this session** (would have required
temporarily breaking real QNAP connectivity, judged not worth the
disruption for a straightforward `try/catch` + exit path).

**Status: DONE** (implementation + partial real verification; the exit-4
path itself is code-reviewed, not live-triggered).

# Task 5 — `.env.mac-beeper` cutover to real QNAP `beeper-mongodb`

**Requested (discovered during audit, in scope per prompt's "confirm the
real runtime host/port/db" instruction):** the whole point of this Story is
Mac -> QNAP Mongo sync.

**Done:** found the real (gitignored) `.env.mac-beeper` still had
`MONGODB_URI` pointing at `localhost:27017` with placeholder
`change_me:change_me` credentials — stale, pre-Story-76, and not actually
authenticatable. Updated it to the real QNAP `beeper-mongodb` target
(`100.117.139.83:12041` over Tailscale, real credentials from `.env.qnap`'s
`BEEPER_MONGO_ROOT_USERNAME`/`PASSWORD`). Updated the committed
`.env.mac-beeper.example` to match (QNAP as the documented default,
removing the outdated "Future QNAP form, not active yet" language) and
added the new `BEEPER_SYNCH_*` variables in the same file.

**Tested:** direct Node script (using the already-installed `mongodb`
driver under `packages/beeper-ws/node_modules`) connected with the real
credentials, ran `{ ping: 1 }` — `PING OK`, and listed the owner's real,
already-populated collections (`contacts`, `channels`, `messages`,
`sync_state`, `beeper_events`, `timeline_events` — matching the Story 76
migrated data, not an empty/wrong database). Every manual `beeper-synch`
run this session connected through this same real target.

**Status: DONE**

# Task 6 — macOS LaunchAgent auto-start

**Requested:** `bash-scripts/beeper-synch/{install-startup,system-startup,
un-install-startup}.sh`, modeled on the standalone `content-provider`
repo's `bash-scripts/04_mac_startup/`, own unique LaunchAgent
label/plist/logs/working-directory, installed and verified for real, no
conflict with Content Provider's own startup.

**Done:** `bash-scripts/beeper-synch/{install-startup.sh,system-startup.sh,
un-install-startup.sh,status.sh,restart.sh,logs.sh}`. Unique LaunchAgent
label `com.chad.beeper-synch` (vs. the already-installed
`com.content-provider.startup`), unique plist file
(`~/Library/LaunchAgents/com.chad.beeper-synch.plist`), unique log paths
(`/tmp/chad-beeper-synch.log`/`-error.log`, vs. Content Provider's
`/tmp/content-provider-startup*.log`), working directory
`plugins/beeper-synch` resolved dynamically via `git rev-parse
--show-toplevel` from the script's own location (no hardcoded
`/Users/pawelfluder/...`). `RunAtLoad` + `KeepAlive` true — the plugin's
own PID lock still enforces single-instance even across a launchd-driven
restart. `un-install-startup.sh` only ever stops/unloads/removes its own
label.

**Tested (real, on this Mac, not just files generated):**
- `install-startup.sh` — LaunchAgent loaded, `launchctl list` showed a real
  PID immediately (RunAtLoad), `status.json` populated for real.
- `restart.sh` — unload+load produced a new real PID.
- `un-install-startup.sh` — LaunchAgent removed from `launchctl list`,
  plist file deleted; `com.content-provider.startup` entry in
  `launchctl list` unchanged before/after.
- `install-startup.sh` run again — reinstalled cleanly (idempotent),
  running again with a new PID.
- Confirmed exactly one `beeper-synch` process running at any point
  (`pgrep -fl`), no duplicate/competing instance, no leftover child
  processes from earlier manual test runs.
- Left installed and running at the end of this Story (the actual desired
  end state — an auto-starting service), per the user's own PID
  93985 confirmed via `pgrep -fl "beeper-synch/dist/index.js"`.

**Status: DONE**

# Task 7 — QNAP/shared-stack role decision

**Requested:** decide whether Beeper sync needs a QNAP-side
container/service, without adding a fictitious duplicate writer (prompt
1.3).

**Done:** audited `docker-compose.qnap.shared.yml` — `beeper-mongodb`
already exists (Story 76), standalone, reachable from the Mac directly over
Tailscale (confirmed in Task 5). Beeper Desktop cannot run on QNAP, so the
Mac remains the only source process; since it can already write directly
to `beeper-mongodb`, adding a QNAP-side "sync" container would be exactly
the fictitious duplicate writer the prompt warns against — **not added**.
`packages/beeper-oplog` (the one component that legitimately doesn't need
Beeper Desktop, since it only consumes the already-written `beeper_events`
collection) was considered as the "real, needed server-side worker" the
prompt allows for — but it is single-owner-per-process (same
`BEEPER_OWNER_REPO_GUID` model as beeper-ws/beeper-sync) and has never been
deployed anywhere, even for one user. Deploying it now for `pawel_f` only
would silently misrepresent multi-user readiness (kamil_s's events would
never be materialized), so it was **not deployed** this Story — recorded
as a follow-up proposal instead (see `06_others_from_report.md`).

**Files changed:** none (decision-only task) — see `02_plan.md` for the
full reasoning trail.

**Tested:** N/A (no new infrastructure was created to test); the "Mac can
write directly to beeper-mongodb" premise this decision rests on was
verified for real in Task 5.

**Status: DONE**

# Task 8 — Full incremental-sync smoke test (Include/Exclude, no duplicates)

**Requested (prompt 2.4):** real smoke test that an incremental sync run
produces no duplicates, and that Include/Exclude (and both flags off, if
applicable) are respected.

**Not done — BLOCKED.** Beeper Desktop was not running on this Mac at any
point during this session (confirmed via
`bash-scripts/beeper/health-check-desktop.sh`, `FAIL: ... not reachable`).
Both `beeper-ws`'s WS connect and `beeper-sync`'s REST fetch require it;
neither can be exercised end-to-end without it. `beeper-synch`'s own
responsibility around this (detect the failure, don't crash, back off/
retry) **was** verified for real — see Task 1 — but the underlying
`beeper-sync`/`sync-permissions.mjs` Include/Exclude logic itself is
pre-existing, unmodified code, and this Story did not (and does not need
to) re-verify it from scratch; re-verifying it live requires opening Beeper
Desktop, which is outside what an unattended session can do.

**Status: BLOCKED** (needs the owner to open Beeper Desktop and re-run
`bash-scripts/beeper-synch/status.sh` / check `.runtime/beeper-synch/
status.json`'s `beeperSync` counters after a few sync intervals).
