// history-worker is RETIRED as of Story 79.
//
// Story 74 built this as a MongoDB Change-Stream consumer watching
// cp_items and writing cp_history asynchronously; Story 78 hardened it
// (readiness signal, persistent shadow-state, stable ordering). Story 79
// replaced that entire approach: cp_history is now written by
// `executeCpMutationWithHistory` (packages/dba/src/cp-history/mutate.ts)
// inside the SAME MongoDB transaction as the cp_items write itself — no
// separate process, no Change Stream, no resume token, no shadow-state
// collection. See ai-docs/history/how-it-works.md for the current
// architecture.
//
// This file is kept only as a harmless no-op so that a stray Docker
// Compose file, deploy script, or manual `pnpm --filter history-worker
// start` invocation someone forgot to update fails loudly and safely
// (exit 0, clear log line) instead of either crash-looping or — far worse
// — silently writing cp_history documents in the OLD schema (no
// mutationId/version/repoGuid/hashes) alongside the new transactional
// writer, which would corrupt the single `cp_history` collection with two
// incompatible document shapes.
//
// No docker-compose.*.yml in this repo references this package anymore
// (removed as part of Story 79) — if you are seeing this log line, some
// other, unreviewed deployment path is still starting this container.
console.log(
  "[history-worker] RETIRED (Story 79) — cp_history is now written transactionally by packages/dba's " +
    "executeCpMutationWithHistory, not by this process. Exiting immediately. " +
    "See ai-docs/history/how-it-works.md. If you expected this container to do something, " +
    "the deployment path that started it needs to stop referencing packages/history-worker."
);
process.exit(0);
