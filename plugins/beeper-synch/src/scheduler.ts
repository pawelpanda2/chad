import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";

export interface PeriodicRunnerSnapshot {
  running: boolean;
  lastRunAt: string | null;
  lastExitCode: number | null;
  nextRunAt: string | null;
  totalRuns: number;
  totalFailures: number;
}

/**
 * Runs packages/beeper-sync (the one-shot incremental REST importer) on a
 * fixed interval, one run at a time (never overlapping) — a failed run is
 * not retried immediately in a tight loop; it just gets picked up again on
 * the next scheduled tick, which is what implements "retry after a
 * temporary network outage" (prompt 2.4) without any bespoke retry-queue
 * logic. Include/Exclude, sync-state cursors and Mongo writes all stay
 * inside beeper-sync itself.
 */
export class PeriodicRunner extends EventEmitter {
  private timer: NodeJS.Timeout | null = null;
  private stopping = false;
  private runningChild: ChildProcess | null = null;
  private lastRunAt: string | null = null;
  private lastExitCode: number | null = null;
  private nextRunAt: string | null = null;
  private totalRuns = 0;
  private totalFailures = 0;

  constructor(
    private readonly name: string,
    private readonly scriptPath: string,
    private readonly args: string[],
    private readonly cwd: string,
    private readonly intervalMs: number
  ) {
    super();
  }

  start(): void {
    this.stopping = false;
    void this.tick();
  }

  private scheduleNext(): void {
    if (this.stopping) return;
    this.nextRunAt = new Date(Date.now() + this.intervalMs).toISOString();
    this.emit("change");
    this.timer = setTimeout(() => void this.tick(), this.intervalMs);
  }

  private async tick(): Promise<void> {
    if (this.stopping) return;
    this.totalRuns += 1;
    this.lastRunAt = new Date().toISOString();
    this.emit("change");
    console.log(`[beeper-synch] ${this.name} run #${this.totalRuns} starting`);

    const exitCode = await new Promise<number | null>((resolveRun) => {
      const child = spawn(process.execPath, [this.scriptPath, ...this.args], {
        cwd: this.cwd,
        stdio: "inherit",
        env: process.env,
      });
      this.runningChild = child;
      child.on("exit", (code) => {
        this.runningChild = null;
        resolveRun(code);
      });
    });

    this.lastExitCode = exitCode;
    if (exitCode !== 0) {
      this.totalFailures += 1;
      console.error(
        `[beeper-synch] ${this.name} run #${this.totalRuns} failed (exit ${exitCode}) — will retry on the next scheduled tick`
      );
    } else {
      console.log(`[beeper-synch] ${this.name} run #${this.totalRuns} completed`);
    }
    this.emit("change");
    this.scheduleNext();
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const child = this.runningChild;
    if (!child) return;
    await new Promise<void>((resolveStop) => {
      const killTimer = setTimeout(() => child.kill("SIGKILL"), 5_000);
      child.once("exit", () => {
        clearTimeout(killTimer);
        resolveStop();
      });
      child.kill("SIGTERM");
    });
  }

  snapshot(): PeriodicRunnerSnapshot {
    return {
      running: this.runningChild !== null,
      lastRunAt: this.lastRunAt,
      lastExitCode: this.lastExitCode,
      nextRunAt: this.nextRunAt,
      totalRuns: this.totalRuns,
      totalFailures: this.totalFailures,
    };
  }
}
