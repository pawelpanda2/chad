/**
 * Shared DbaDataRouter singleton for `packages/dba` business functions.
 *
 * Story 72 built the router/provider layer but left every existing `dba`
 * function on its pre-existing direct `invokeContentProvider` path — this
 * is the first real wiring of that layer into a live business function
 * (Daily/Date Entry — see `leads.ts`), per the follow-up session's
 * explicit priority: get MongoDB actually serving real requests, not just
 * passing its own unit tests.
 */

import { loadDataProvidersConfig } from "./data-providers/config.js";
import { MongoCpProvider } from "./data-providers/mongo-cp-provider.js";
import { NetFileCpProvider } from "./data-providers/net-file-cp-provider.js";
import { DbaDataRouter } from "./data-router.js";
import type { CpCompatibleDataProvider, DataBackendName } from "./data-providers/types.js";

let instance: DbaDataRouter | null = null;
let mongoProviderInstance: MongoCpProvider | null = null;

export function getDataRouter(): DbaDataRouter {
  if (!instance) {
    const config = loadDataProvidersConfig();
    const providers: Partial<Record<DataBackendName, CpCompatibleDataProvider>> = {};
    if (config.mongoEnabled) providers.mongo = getMongoProvider();
    if (config.contentProviderEnabled) providers["content-provider"] = new NetFileCpProvider();

    instance = new DbaDataRouter({
      config,
      providers,
      // CP-follower problems must never surface as user-facing errors —
      // logged only (this priority's point 2: "nie blokuj działania
      // MongoDB błędami CP").
      onFollowerEnqueueError: (error, command) => {
        console.error(`[dba] Follower enqueue failed for operation ${command.operationId} (non-fatal):`, error);
      },
    });
  }
  return instance;
}

/** Direct Mongo access for read-model helpers that don't go through the router's write path (e.g. getChildItems). */
export function getMongoProvider(): MongoCpProvider {
  if (!mongoProviderInstance) {
    mongoProviderInstance = new MongoCpProvider();
  }
  return mongoProviderInstance;
}
