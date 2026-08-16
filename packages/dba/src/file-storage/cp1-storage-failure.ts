/**
 * Local Mac Docker only: detect real cp_1 / virtiofs storage failures and
 * signal the host watchdog via a file under /app/runtime (bind → .runtime).
 *
 * Never triggers on plain ENOENT (missing single file). Never runs sudo/mount.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** Node errno / message fragments that indicate dead SMB / stale bind. */
const STORAGE_FAILURE_ERRNOS = new Set([
  "EBADF",
  "ENOTDIR",
  "EIO",
  "EPERM",
  "ECONNRESET",
  "ETIMEDOUT",
  "EHOSTDOWN",
  "ENETDOWN",
]);

const STORAGE_FAILURE_MESSAGE_RE =
  /bad file descriptor|enotdir|input\/output error|operation not permitted|stale (file|nfs|smb)|no such device/i;

export function isCp1StorageFailure(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as NodeJS.ErrnoException;
  if (err.code === "ENOENT") return false;
  if (err.code && STORAGE_FAILURE_ERRNOS.has(err.code)) return true;
  if (typeof err.message === "string" && STORAGE_FAILURE_MESSAGE_RE.test(err.message)) {
    return true;
  }
  return false;
}

function runtimeRoot(): string {
  const pref = process.env.DEV_DB_SOURCE_PREF_PATH?.trim();
  if (pref) return dirname(pref);
  if (process.env.CHAD_RUNTIME_DIR?.trim()) return process.env.CHAD_RUNTIME_DIR.trim();
  return "/app/runtime";
}

/**
 * Ask the host-side watchdog to repair cp_1. No-op outside CHAD_ENVIRONMENT=local.
 * Writes `.runtime/cp1-repair/request` (visible on the Mac host via bind mount).
 */
export function requestLocalCp1Repair(reason: string): void {
  if (process.env.CHAD_ENVIRONMENT !== "local") return;
  try {
    const dir = join(runtimeRoot(), "cp1-repair");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "request"),
      JSON.stringify({
        action: "repair-cp1",
        reason: reason.slice(0, 200),
        at: new Date().toISOString(),
      }),
      { encoding: "utf8", flag: "w" },
    );
  } catch {
    // Never fail the business call because signaling failed.
  }
}

export function isCp1DegradedMode(): boolean {
  const mode = (process.env.CHAD_CP1_MODE || "healthy").trim().toLowerCase();
  return mode === "degraded" || mode === "unavailable";
}

/** If `error` looks like storage failure on local Mac, signal host repair. */
export function maybeRequestCp1Repair(error: unknown, context: string): void {
  if (process.env.CHAD_ENVIRONMENT !== "local") return;
  if (!isCp1StorageFailure(error)) return;
  const code = (error as NodeJS.ErrnoException)?.code ?? "unknown";
  requestLocalCp1Repair(`${context}:${code}`);
}
