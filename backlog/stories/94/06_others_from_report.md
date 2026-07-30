# Story 94 — Others

## Cross-session collision (fixed as part of this Story)

A parallel session working on Recording-name defaults hit `Cannot find name
'formatBeeperMessagesAsExport'` in `packages/dba/src/message-creator.ts`
mid-build. That was this Story's own in-flight refactor (moving that
private helper into `whatsapp-messages.ts` as the now-shared
`formatBeeperMessagesForExport`), caught by their build in a transient
inconsistent state since both sessions share the same working directory
with no git worktree isolation. Confirmed fully consistent afterward —
`grep -rn "formatBeeperMessagesAsExport" packages/` returns nothing, `pnpm
--filter dba build`/`typecheck` both pass clean.

## Local Docker deploy blocker (not caused by this Story)

`bash-scripts/dashboard/03_local_mac_docker/06_deploy.sh` initially failed:
`mkdir /host_mnt/Volumes/cp_1: permission denied` — the Recording feature's
audio bind mount (`CHAD_AUDIO_RECORDINGS_HOST_PATH`, default
`/Volumes/cp_1/...`, from `docker-compose.local.yml`) pointed at a QNAP SMB
share that wasn't mounted on this Mac at the time. Resolved once the user
mounted `/Volumes/cp_1` themselves; unrelated to Beeper Conversations.

## Combined local deploy with the parallel session

Both sessions' changes were uncommitted in the same working tree at deploy
time. Per the user's explicit choice, local Docker was deployed once with
both changesets combined rather than deploying twice. For the TEST deploy,
only this Story's files were staged/committed/pushed (see
`05_tasks_and_checklist.md` and the commit itself) — the other session's
still-uncommitted files were deliberately left out of this Story's commit,
consistent with "limit commit scope to Beeper GUI/API/DBA/tests/docs."

## Known limitation / deliberately not exercised

Permissions tab's Include/Exclude checkboxes were verified by code
inspection (unchanged extraction) rather than by clicking a real
production contact's checkbox, per the Story's explicit data-safety rule
against mutating real Include/Exclude state during this task.
