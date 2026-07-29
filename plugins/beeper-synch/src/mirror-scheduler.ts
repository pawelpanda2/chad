import { EventEmitter } from "node:events";
import type { BeeperMirrorMetadata } from "dba";

export type RefreshFn = (opts: { repoGuid: string; sourceUri: string; targetUri: string }) => Promise<BeeperMirrorMetadata>;

export interface MirrorRunnerSnapshot {
  running: boolean;
  lastCheckedAt: string | null;
  lastResult: "PASS" | "NO_CHANGE" | "FAIL" | null;
  lastSuccessAt: string | null;
  totalRuns: number;
  totalFailures: number;
}

/**
 * Runs dba's refreshBeeperMongoMirror() (QNAP -> local Mongo, one-way, see
 * packages/dba/src/beeper-mongo-mirror/refresh.ts) on a fixed interval, one
 * run at a time (never overlapping — a run that takes longer than the
 * interval simply delays the next tick rather than starting a second one).
 * Independent of beeper-ws/beeper-sync's health: the mirror only needs
 * QNAP, never Beeper Desktop, so it keeps refreshing even while beeper-ws
 * is stuck in a Beeper-Desktop-unreachable backoff loop.
 *
 * This is the "thin dedicated module" the plugin schedules — all mirror
 * logic (staging, verification, atomic per-collection swap, last-good
 * preservation on failure) lives in dba, not here.
 */
export class MirrorRunner extends EventEmitter {
  private timer: NodeJS.Timeout | null = null;
  private stopping = false;
  private inFlight: Promise<BeeperMirrorMetadata> | null = null;
  private lastCheckedAt: string | null = null;
  private lastResult: MirrorRunnerSnapshot["lastResult"] = null;
  private lastSuccessAt: string | null = null;
  private totalRuns = 0;
  private totalFailures = 0;

  constructor(
    private readonly repoGuid: string,
    private readonly sourceUri: string,
    private readonly targetUri: string,
    private readonly intervalMs: number,
    private readonly refreshFn: RefreshFn
  ) {
    super();
  }

  start(): void {
    this.stopping = false;
    void this.tick();
  }

  private scheduleNext(): void {
    if (this.stopping) return;
    this.timer = setTimeout(() => void this.tick(), this.intervalMs);
  }

  private async tick(): Promise<void> {
    if (this.stopping) return;
    this.totalRuns += 1;
    const promise = this.refreshFn({
      repoGuid: this.repoGuid,
      sourceUri: this.sourceUri,
      targetUri: this.targetUri,
    });
    this.inFlight = promise;
    this.emit("change");

    try {
      const meta = await promise;
      this.lastCheckedAt = meta.lastCheckedAt;
      this.lastResult = meta.result;
      this.lastSuccessAt = meta.lastSuccessAt ?? this.lastSuccessAt;
      if (meta.result === "FAIL") {
        this.totalFailures += 1;
        console.error(`[beeper-synch] mirror refresh #${this.totalRuns} FAIL: ${meta.lastError}`);
      } else {
        console.log(
          `[beeper-synch] mirror refresh #${this.totalRuns} ${meta.result} — ${Object.entries(meta.collections)
            .map(([k, v]) => `${k}=${v}`)
            .join(" ")}`
        );
      }
    } catch (err) {
      // refreshBeeperMongoMirror() itself is designed to never throw (it
      // catches internally and returns a FAIL metadata object) — this only
      // fires for a genuinely unexpected error (e.g. a bug), and must not
      // crash the whole beeper-synch process over a mirror problem.
      this.totalFailures += 1;
      console.error(`[beeper-synch] mirror refresh #${this.totalRuns} threw unexpectedly:`, err);
    } finally {
      this.inFlight = null;
      this.emit("change");
      this.scheduleNext();
    }
  }

  /** Stops scheduling further runs and waits for any in-flight refresh to finish (never aborts mid-copy). */
  async stop(): Promise<void> {
    this.stopping = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.inFlight) {
      await this.inFlight.catch(() => {});
    }
  }

  snapshot(): MirrorRunnerSnapshot {
    return {
      running: this.inFlight !== null,
      lastCheckedAt: this.lastCheckedAt,
      lastResult: this.lastResult,
      lastSuccessAt: this.lastSuccessAt,
      totalRuns: this.totalRuns,
      totalFailures: this.totalFailures,
    };
  }
}
