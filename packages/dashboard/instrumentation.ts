/**
 * Next.js instrumentation hook — `register()` runs exactly once when this
 * server process starts (both `next dev` and the standalone `next start`
 * used in Docker), before any request is handled. This is the officially
 * supported place to start a process-lifetime background task, so it's
 * where the Google Sheets sync worker (Story 75) is started — no separate
 * worker container, it just runs as a `setTimeout` interval loop inside
 * this already-running Dashboard process (see `dba`'s
 * `google-sheets/bootstrap.ts`/`worker.ts` for the loop itself).
 *
 * Guarded to the Node.js runtime only — `register()` also fires once for
 * the Edge runtime in a middleware-enabled app, which has no `setTimeout`-
 * based long-lived loop story and doesn't need this at all.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startGoogleSheetsSyncWorkerIfEnabled } = await import("dba");
    startGoogleSheetsSyncWorkerIfEnabled();
  }
}
