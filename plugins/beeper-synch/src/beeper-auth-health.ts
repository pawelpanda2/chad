/**
 * Probe Beeper Desktop REST auth (Story 106). Never logs the API key.
 * Used by beeper-synch status writer and the local Dashboard helper.
 */
export type AuthorizationStatus =
  | "authorized"
  | "token_expired"
  | "unauthorized"
  | "unreachable"
  | "unknown";

export interface BeeperAuthProbe {
  beeperDesktopReachable: boolean;
  authorizationStatus: AuthorizationStatus;
  lastErrorCode: string | null;
  lastErrorMessageShort: string | null;
}

export async function probeBeeperDesktopAuth(opts: {
  restUrl: string;
  apiKey: string;
  timeoutMs?: number;
}): Promise<BeeperAuthProbe> {
  const base = opts.restUrl.replace(/\/$/, "");
  const timeoutMs = opts.timeoutMs ?? 5_000;
  if (!opts.apiKey) {
    return {
      beeperDesktopReachable: false,
      authorizationStatus: "unknown",
      lastErrorCode: "missing_api_key",
      lastErrorMessageShort: "BEEPER_API_KEY not set",
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}/v1/app/setup`, {
      headers: { Authorization: `Bearer ${opts.apiKey}`, Accept: "application/json" },
      signal: controller.signal,
    });
    if (res.status === 200) {
      return {
        beeperDesktopReachable: true,
        authorizationStatus: "authorized",
        lastErrorCode: null,
        lastErrorMessageShort: null,
      };
    }
    const body = await res.text().catch(() => "");
    let message = "";
    let code = "";
    try {
      const json = JSON.parse(body) as { message?: string; code?: string };
      message = typeof json.message === "string" ? json.message : "";
      code = typeof json.code === "string" ? json.code : "";
    } catch {
      /* ignore */
    }
    const expired =
      res.status === 401 &&
      (message.toLowerCase().includes("token expired") || body.toLowerCase().includes("token expired"));
    if (expired) {
      return {
        beeperDesktopReachable: true,
        authorizationStatus: "token_expired",
        lastErrorCode: code || "unauthorized",
        lastErrorMessageShort: "Token expired",
      };
    }
    if (res.status === 401 || res.status === 403) {
      return {
        beeperDesktopReachable: true,
        authorizationStatus: "unauthorized",
        lastErrorCode: code || String(res.status),
        lastErrorMessageShort: message || "unauthorized",
      };
    }
    return {
      beeperDesktopReachable: true,
      authorizationStatus: "unknown",
      lastErrorCode: String(res.status),
      lastErrorMessageShort: message || `HTTP ${res.status}`,
    };
  } catch {
    return {
      beeperDesktopReachable: false,
      authorizationStatus: "unreachable",
      lastErrorCode: "unreachable",
      lastErrorMessageShort: "Beeper Desktop not reachable",
    };
  } finally {
    clearTimeout(timer);
  }
}

export function computeHealthy(input: {
  supervisorRunning: boolean;
  wsRunning: boolean;
  oplogRunning: boolean;
  authorizationStatus: AuthorizationStatus;
  lastSyncExitCode: number | null;
}): boolean {
  return (
    input.supervisorRunning &&
    input.wsRunning &&
    input.oplogRunning &&
    input.authorizationStatus === "authorized" &&
    (input.lastSyncExitCode === null || input.lastSyncExitCode === 0)
  );
}

/** Map health fields → Dashboard Plugin synch UI status (exact strings). */
export function mapHealthToUiStatus(input: {
  supervisorRunning: boolean;
  healthy: boolean;
  authorizationStatus: AuthorizationStatus;
  lastSyncExitCode: number | null;
  processWasAlreadyUp?: boolean;
  justStarted?: boolean;
}): string {
  if (!input.supervisorRunning) return "unhealthy";
  if (input.authorizationStatus === "token_expired") return "token expired";
  if (input.authorizationStatus === "unauthorized") return "unauthorized";
  if (input.authorizationStatus === "unreachable") return "unhealthy";
  if (input.lastSyncExitCode !== null && input.lastSyncExitCode !== 0) return "sync failed";
  // Final success is always "running" — never mask with "already running".
  if (input.healthy) return "running";
  if (input.justStarted) return "starting";
  return "unhealthy";
}
