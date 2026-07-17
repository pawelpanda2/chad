# Story 59 — Todos (working scratchpad)

1. **Finish Task 3's live `beeper-ws`/`beeper-sync` verification.** Blocked
   on Beeper Desktop being open — this session could not launch it (`open
   -a "Beeper Desktop"` did not produce a running process, confirmed via
   `ps`/`osascript`/`lsof`, see `05_tasks_and_checklist.md` Task 3). Once
   the user opens Beeper Desktop manually: run
   `bash bash-scripts/beeper/05_sync.sh` (incremental REST sync — confirm
   it doesn't re-pull everything and produces no duplicates) and
   `bash bash-scripts/beeper/02_re-start.sh` (starts `beeper-ws`; then
   trigger one real Beeper event and confirm it lands in `beeper_events`
   and the dashboard reflects it).
