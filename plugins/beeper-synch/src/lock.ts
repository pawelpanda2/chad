import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export class LockHeldError extends Error {
  constructor(public readonly holderPid: number, lockFile: string) {
    super(`beeper-synch is already running (pid ${holderPid}, lock file ${lockFile})`);
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    // signal 0: no-op, just checks the process exists and is ours to signal
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

/**
 * Enforces "only one instance" (prompt 3.3/5). Throws LockHeldError if a
 * live process already holds the lock. A lock file left behind by a
 * process that is no longer running (stale — e.g. after a crash or `kill
 * -9`) is treated as free and silently reclaimed, not as an error.
 */
export function acquireLock(lockFile: string, pid: number = process.pid): void {
  if (existsSync(lockFile)) {
    const holderPid = Number(readFileSync(lockFile, "utf8").trim());
    if (Number.isFinite(holderPid) && holderPid > 0 && isProcessAlive(holderPid)) {
      throw new LockHeldError(holderPid, lockFile);
    }
  }
  mkdirSync(dirname(lockFile), { recursive: true });
  writeFileSync(lockFile, String(pid), "utf8");
}

/** Only removes the lock if it still points at `pid` — never clears a lock acquired by a newer instance. */
export function releaseLock(lockFile: string, pid: number = process.pid): void {
  if (!existsSync(lockFile)) return;
  const holderPid = Number(readFileSync(lockFile, "utf8").trim());
  if (holderPid === pid) {
    rmSync(lockFile, { force: true });
  }
}
