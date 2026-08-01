import { resolve } from "node:path";
import { refreshBeeperMongoMirror } from "dba";
import { ConfigError, loadConfig } from "./config.js";
import { acquireLock, LockHeldError, releaseLock } from "./lock.js";
import { MirrorRunner } from "./mirror-scheduler.js";
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

  // beeper-oplog — long-lived materializer, beeper_events -> contacts/
  // channels/messages (polls by _id every 5s internally, own durable
  // cursor in beeper_oplog_state, see packages/beeper-oplog/index.mjs).
  // Without this running, beeper-ws's real-time writes sit in raw
  // beeper_events forever: beeper-sync only performs each channel's ONE
  // historical backfill (marks it "fully_synced" and skips it on every
  // later run — it is not an incremental poller), so this is the only
  // process that turns ongoing Beeper activity into what the
  // Dashboard/GUI actually reads. Supervised exactly like beeper-ws
  // (long-lived process with its own SIGINT/SIGTERM handling), not
  // scheduled like beeper-sync.
  const oplog = new SupervisedProcess(
    "beeper-oplog",
    resolve(config.beeperOplogDir, "index.mjs"),
    config.beeperOplogDir,
    { minMs: config.minBackoffMs, maxMs: config.maxBackoffMs }
  );

  // dba's beeperMirrorStatusRoot() falls back to `process.cwd()` when not
  // running in Docker (see packages/dba/src/beeper-mongo-mirror/metadata.ts)
  // — but system-startup.sh `cd`s into plugins/beeper-synch before exec'ing
  // this process, so an unset override would silently write mirror status
  // under plugins/beeper-synch/.runtime/ instead of the repo root's
  // .runtime/, which is the ONLY place the Dashboard's Dev Panel (and
  // status.sh) ever reads from — found for real during Story 92 manual
  // verification (Dev Panel showed a stale FAIL from an earlier ad-hoc test
  // run while the real LaunchAgent-managed refresh kept succeeding into the
  // wrong file). Pin it explicitly, anchored to config.repoRoot (which is
  // computed from import.meta.url, never cwd) so both processes always
  // agree on one file.
  process.env.BEEPER_MIRROR_STATUS_ROOT = resolve(config.repoRoot, ".runtime/beeper-mongo-mirror");

  // Local Mongo readonly mirror (Story 92) — independent of Beeper Desktop,
  // so it keeps refreshing even while beeper-ws/beeper-sync are stuck
  // waiting for Beeper Desktop to come back. Same QNAP source the writers
  // use (config.mongodbUri); a SEPARATE local target
  // (config.localMirrorMongoUri, never the Dashboard's own env).
  const mirror = new MirrorRunner(
    config.ownerRepoGuid,
    config.mongodbUri,
    config.localMirrorMongoUri,
    config.mirrorIntervalMs,
    refreshBeeperMongoMirror
  );

  const startedAt = new Date().toISOString();
  const refreshStatus = () => {
    writeStatus(config.statusFile, {
      pid: process.pid,
      startedAt,
      ready: ws.isRunning,
      beeperWs: ws.snapshot(),
      beeperSync: sync.snapshot(),
      beeperOplog: oplog.snapshot(),
      beeperMongoMirror: mirror.snapshot(),
    });
  };

  ws.on("change", refreshStatus);
  sync.on("change", refreshStatus);
  oplog.on("change", refreshStatus);
  mirror.on("change", refreshStatus);

  ws.start();
  sync.start();
  oplog.start();
  mirror.start();
  refreshStatus();

  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[beeper-synch] received ${signal} — shutting down...`);
    await Promise.all([ws.stop(), sync.stop(), oplog.stop(), mirror.stop()]);
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
