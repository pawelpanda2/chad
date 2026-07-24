/**
 * Starts the data-sync outbox worker inside whatever process calls this —
 * no separate container, mirroring `google-sheets/bootstrap.ts`'s exact
 * pattern (Story 75/81). Closes the Story 72 gap where `data-outbox-worker.ts`
 * was fully implemented/tested but never wired into any running process.
 *
 * Opt-in via `DBA_DATA_OUTBOX_WORKER_ENABLED=true` — unlike the Google
 * Sheets worker (which is production-guarded ON by default whenever
 * configured), this defaults OFF so introducing it doesn't silently start
 * draining `cp_outbox_data_sync`/`data_sync_outbox` everywhere Story 80's
 * dispatcher already exists. The follower it drains toward
 * (`content-provider`, via `NetFileCpProvider`) must also be enabled
 * (`DBA_CONTENT_PROVIDER_ENABLED=true`) or there is nothing for it to do.
 *
 * Idempotent against being called more than once in the same process (e.g.
 * Next.js dev-mode module re-evaluation) — only the first call actually
 * starts a loop. Graceful shutdown: `stopDataOutboxWorker()` (also
 * registered against SIGTERM/SIGINT) calls the stop function
 * `runOutboxWorker` already returns, so the interval loop stops scheduling
 * further ticks — no in-flight job is interrupted mid-write, since a claim
 * (`FOR UPDATE SKIP LOCKED` / Mongo's atomic `findOneAndUpdate`) plus its
 * follower write already happen inside one `processOutboxJobsOnce` call
 * before the next tick is ever scheduled.
 */

import { getDataRouter, getMongoProvider } from "./data-router-instance.js";
import { runOutboxWorker } from "./data-outbox-worker.js";
import { loadDataProvidersConfig } from "./data-providers/config.js";
import { getPostgresProvider } from "./data-router-instance.js";
import type { CpCompatibleDataProvider, DataBackendName } from "./data-providers/types.js";
import { NetFileCpProvider } from "./data-providers/net-file-cp-provider.js";

let stop: (() => void) | null = null;

function readBool(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return defaultValue;
  return raw === "true" || raw === "1";
}

/**
 * Starts the worker if `DBA_DATA_OUTBOX_WORKER_ENABLED=true`. Never throws
 * — a misconfiguration here must never crash Dashboard startup, same
 * contract as `startGoogleSheetsSyncWorkerIfEnabled`.
 */
export function startDataOutboxWorkerIfEnabled(intervalMs = 5000): (() => void) | null {
  if (stop) {
    console.log("[data-outbox] startDataOutboxWorkerIfEnabled called again — already running, ignoring.");
    return null;
  }

  if (!readBool("DBA_DATA_OUTBOX_WORKER_ENABLED", false)) {
    console.log("[data-outbox] worker not started — DBA_DATA_OUTBOX_WORKER_ENABLED is not true.");
    return null;
  }

  let config;
  try {
    config = loadDataProvidersConfig();
  } catch (error) {
    console.error("[data-outbox] worker NOT started — invalid data-providers config:", error instanceof Error ? error.message : error);
    return null;
  }

  if (!config.contentProviderEnabled) {
    console.log("[data-outbox] worker not started — DBA_CONTENT_PROVIDER_ENABLED is not true (nothing to follow toward).");
    return null;
  }

  const providers: Partial<Record<DataBackendName, CpCompatibleDataProvider>> = {
    "content-provider": new NetFileCpProvider(),
  };
  if (config.mongoEnabled) providers.mongo = getMongoProvider();
  if (config.postgresEnabled) providers.postgres = getPostgresProvider();
  void getDataRouter(); // ensures the router/config singleton is initialized the same way the rest of the app sees it

  console.log(`[data-outbox] worker starting (intervalMs=${intervalMs}, primaryBackend=${config.primaryBackend})`);

  stop = runOutboxWorker({ providers, workerId: `data-outbox-${process.pid}` }, intervalMs);

  const shutdown = () => stopDataOutboxWorker();
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);

  return stop;
}

/** Graceful shutdown — stops scheduling further ticks; no in-flight job is interrupted (see file header). */
export function stopDataOutboxWorker(): void {
  if (stop) {
    console.log("[data-outbox] worker stopping.");
    stop();
    stop = null;
  }
}
