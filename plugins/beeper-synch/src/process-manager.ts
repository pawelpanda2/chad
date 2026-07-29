import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { Backoff } from "./backoff.js";

export interface SupervisedProcessSnapshot {
  running: boolean;
  pid: number | null;
  restarts: number;
  lastExitCode: number | null;
  lastExitSignal: NodeJS.Signals | null;
}

/**
 * Supervises one long-lived child process (packages/beeper-ws/index.mjs) —
 * spawn, restart with bounded backoff on unexpected exit, graceful stop.
 * Does not know anything about WebSockets, Beeper, or Mongo: that logic
 * stays entirely inside beeper-ws itself (prompt 2.6 — "cienki
 * runtime/orchestrator").
 */
export class SupervisedProcess extends EventEmitter {
  private child: ChildProcess | null = null;
  private stopping = false;
  private restarts = 0;
  private lastExitCode: number | null = null;
  private lastExitSignal: NodeJS.Signals | null = null;
  private startedAt = 0;
  private restartTimer: NodeJS.Timeout | null = null;
  private readonly backoff: Backoff;

  constructor(
    private readonly name: string,
    private readonly scriptPath: string,
    private readonly cwd: string,
    backoffOpts: { minMs: number; maxMs: number; stableAfterMs?: number }
  ) {
    super();
    this.backoff = new Backoff({ stableAfterMs: 60_000, ...backoffOpts });
  }

  start(): void {
    if (this.child) return;
    this.stopping = false;
    this.startedAt = Date.now();
    this.child = spawn(process.execPath, [this.scriptPath], {
      cwd: this.cwd,
      stdio: "inherit",
      env: process.env,
    });
    console.log(`[beeper-synch] ${this.name} started (pid ${this.child.pid ?? "?"})`);
    this.emit("change");

    this.child.on("exit", (code, signal) => {
      const uptimeMs = Date.now() - this.startedAt;
      this.lastExitCode = code;
      this.lastExitSignal = signal;
      this.child = null;
      this.backoff.noteStableUptime(uptimeMs);
      this.emit("change");

      if (this.stopping) return;

      this.restarts += 1;
      const delay = this.backoff.nextDelay();
      console.error(
        `[beeper-synch] ${this.name} exited (code=${code}, signal=${signal}, uptime=${Math.round(uptimeMs / 1000)}s)` +
          ` — restarting in ${Math.round(delay / 1000)}s (attempt ${this.backoff.attemptCount})`
      );
      this.restartTimer = setTimeout(() => this.start(), delay);
    });
  }

  /** Graceful stop: SIGTERM, then SIGKILL after a grace period if it doesn't exit. */
  async stop(): Promise<void> {
    this.stopping = true;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    const child = this.child;
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

  get isRunning(): boolean {
    return this.child !== null;
  }

  snapshot(): SupervisedProcessSnapshot {
    return {
      running: this.isRunning,
      pid: this.child?.pid ?? null,
      restarts: this.restarts,
      lastExitCode: this.lastExitCode,
      lastExitSignal: this.lastExitSignal,
    };
  }
}
