/**
 * Next.js instrumentation hook — `register()` runs exactly once when this
 * server process starts (both `next dev` and the standalone `next start`
 * used in Docker), before any request is handled. This is the officially
 * supported place to start a process-lifetime background task, so it's
 * where the Google Sheets sync worker (Story 75), the data-sync outbox
 * worker (Story 81), and the Links V2 daily sync scheduler (Story 104) are
 * started — no separate worker container, each just runs as a `setTimeout`
 * interval loop inside this already-running Dashboard process (see `dba`'s
 * `google-sheets/bootstrap.ts`/`worker.ts`,
 * `data-outbox-bootstrap.ts`/`data-outbox-worker.ts`, and
 * `links-v2/scheduler.ts`).
 *
 * Guarded to the Node.js runtime only — `register()` also fires once for
 * the Edge runtime in a middleware-enabled app, which has no `setTimeout`-
 * based long-lived loop story and doesn't need this at all.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const {
      startGoogleSheetsSyncWorkerIfEnabled,
      startDataOutboxWorkerIfEnabled,
      startLinksV2DailySchedulerIfEnabled,
    } = await import("dba");
    startGoogleSheetsSyncWorkerIfEnabled();
    // Story 81 — closes the Story 72 gap where this worker was implemented
    // but never wired into a running process. Opt-in
    // (DBA_DATA_OUTBOX_WORKER_ENABLED=true) — see data-outbox-bootstrap.ts.
    startDataOutboxWorkerIfEnabled();
    // Story 104 — checks every few minutes whether it's past ~05:00 local
    // time and a sync hasn't run yet today; when due, syncs Links V2 for
    // every CHAD user. Default on — set LINKS_V2_SYNC_ENABLED=false to
    // disable (e.g. tests).
    startLinksV2DailySchedulerIfEnabled();
  }
}
