import { resolve } from "node:path";
import { ConfigError, loadConfig } from "./config.js";
import { acquireLock, LockHeldError, releaseLock } from "./lock.js";
import { preflightMongo } from "./mongo-preflight.js";
import { redactMongoUri } from "./owner-db.js";
import { SupervisedProcess } from "./process-manager.js";
import { PeriodicRunner } from "./scheduler.js";
import { writeStatus } from "./status.js";

/**
 * Exit codes (prompt 3.3 — "czytelne kody wyjścia" / "odróżnienie błędu
 * źródła Beeper od błędu Mongo"):
 *   0 = clean shutdown (SIGINT/SIGTERM)
 *   1 = unexpected/generic fatal error
 *   2 = invalid configuration (missing env, missing sibling packages)
 *   3 = another instance is already running (lock held)
 *   4 = Mongo preflight failed (target unreachable / auth failed)
 */
async function main(): Promise<void> {
  const config = loadConfig();

  console.log(
    `[beeper-synch] starting — instance=${config.instanceId} owner=${config.ownerRepoGuid} ` +
      `mongo=${redactMongoUri(config.mongodbUri)} syncIntervalMs=${config.syncIntervalMs}`
  );

  try {
    acquireLock(config.lockFile);
  } catch (err) {
    if (err instanceof LockHeldError) {
      console.error(`[beeper-synch] ${err.message}`);
      process.exit(3);
    }
    throw err;
  }

  let shuttingDown = false;
  const shutdownOnFailure = (code: number) => {
    releaseLock(config.lockFile);
    process.exit(code);
  };

  try {
    await preflightMongo(config);
    console.log("[beeper-synch] Mongo preflight OK");
  } catch (err) {
    console.error(
      `[beeper-synch] Mongo preflight failed: ${(err as Error).message} — not starting beeper-ws/beeper-sync.`
    );
    shutdownOnFailure(4);
    return;
  }

  const ws = new SupervisedProcess(
    "beeper-ws",
    resolve(config.beeperWsDir, "index.mjs"),
    config.beeperWsDir,
    { minMs: config.minBackoffMs, maxMs: config.maxBackoffMs }
  );

  const sync = new PeriodicRunner(
    "beeper-sync",
    resolve(config.beeperSyncDir, "index.mjs"),
    [],
    config.beeperSyncDir,
    config.syncIntervalMs
  );

  const startedAt = new Date().toISOString();
  const refreshStatus = () => {
    writeStatus(config.statusFile, {
      pid: process.pid,
      startedAt,
      ready: ws.isRunning,
      beeperWs: ws.snapshot(),
      beeperSync: sync.snapshot(),
    });
  };

  ws.on("change", refreshStatus);
  sync.on("change", refreshStatus);

  ws.start();
  sync.start();
  refreshStatus();

  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[beeper-synch] received ${signal} — shutting down...`);
    await Promise.all([ws.stop(), sync.stop()]);
    writeStatus(config.statusFile, { pid: process.pid, ready: false, stoppedAt: new Date().toISOString() });
    releaseLock(config.lockFile);
    console.log("[beeper-synch] shutdown complete");
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  if (err instanceof ConfigError) {
    console.error(`[beeper-synch] configuration error: ${err.message}`);
    process.exit(2);
  }
  console.error("[beeper-synch] fatal:", err);
  process.exit(1);
});
