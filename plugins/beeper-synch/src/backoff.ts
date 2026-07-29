/**
 * Bounded exponential backoff with jitter, for the beeper-ws supervised
 * process. Pure/stateless calculation (`nextDelayMs`) plus a small stateful
 * wrapper (`Backoff`) that tracks the attempt count and resets it once a
 * child process has stayed up for `stableAfterMs` — this is what stops a
 * genuinely-flapping process from tight-looping (delay grows every crash)
 * while not permanently penalizing a process that failed once, long ago,
 * and has been healthy since.
 */

export interface BackoffOptions {
  minMs: number;
  maxMs: number;
  /** how long a process must stay up before the attempt counter resets */
  stableAfterMs: number;
}

export function nextDelayMs(attempt: number, opts: Pick<BackoffOptions, "minMs" | "maxMs">): number {
  if (attempt <= 0) return 0;
  const raw = opts.minMs * 2 ** (attempt - 1);
  const capped = Math.min(raw, opts.maxMs);
  // +/-20% jitter so multiple crash-looping processes don't retry in lockstep
  const jitter = capped * (0.8 + Math.random() * 0.4);
  return Math.round(jitter);
}

export class Backoff {
  private attempt = 0;

  constructor(private readonly opts: BackoffOptions) {}

  get attemptCount(): number {
    return this.attempt;
  }

  /** call right before scheduling a restart; returns the delay to wait */
  nextDelay(): number {
    this.attempt += 1;
    return nextDelayMs(this.attempt, this.opts);
  }

  /** call once a start has been stable for `stableAfterMs` */
  noteStableUptime(uptimeMs: number): void {
    if (uptimeMs >= this.opts.stableAfterMs) {
      this.attempt = 0;
    }
  }

  reset(): void {
    this.attempt = 0;
  }
}
