/**
 * Closed Dashboard ↔ host beeper-synch helper client (Story 105/106).
 * Passes through health-aware statuses from the host helper.
 */

export const PLUGIN_NO_CONNECTION = "error no connection to plugin" as const;

export type PluginSynchUiStatus =
	| "running"
	| "starting"
	| "started"
	| "already running"
	| "unhealthy"
	| "token expired"
	| "unauthorized"
	| "sync failed"
	| "failed"
	| typeof PLUGIN_NO_CONNECTION
	| "";

export const PLUGIN_ERROR_STATUSES = new Set<PluginSynchUiStatus>([
	"unhealthy",
	"token expired",
	"unauthorized",
	"sync failed",
	"failed",
	PLUGIN_NO_CONNECTION,
]);

export function isPluginSynchErrorStatus(status: string): boolean {
	return PLUGIN_ERROR_STATUSES.has(status as PluginSynchUiStatus);
}

/** Short user-facing copy for ErrorBox (never includes secrets). */
export function pluginSynchStatusMessage(status: string): string {
	switch (status) {
		case "token expired":
			return "Beeper API token expired. Generate a new token in Beeper Desktop, then set BEEPER_API_KEY in .env.mac-beeper (not the helper token).";
		case "unauthorized":
			return "Beeper API unauthorized. Check BEEPER_API_KEY in .env.mac-beeper.";
		case "sync failed":
			return "Beeper sync failed. Open Plugin synch logs and retry.";
		case "unhealthy":
			return "Plugin synch is unhealthy (process may be up, but auth/sync/ws failed).";
		case "failed":
			return "Plugin synch failed to start.";
		case PLUGIN_NO_CONNECTION:
			return "No connection to plugin synch helper on this machine.";
		default:
			return status;
	}
}

const KNOWN = new Set<string>([
	"running",
	"starting",
	"started",
	"already running",
	"unhealthy",
	"token expired",
	"unauthorized",
	"sync failed",
	"failed",
	PLUGIN_NO_CONNECTION,
	"",
]);

const DEFAULT_TIMEOUT_MS = 45_000;

export function isLocalPluginSynchEnabled(): boolean {
	const chadEnv = process.env.CHAD_ENVIRONMENT;
	if (chadEnv === "test" || chadEnv === "prod") return false;
	if (chadEnv !== "local") return false;
	const url = (process.env.BEEPER_SYNCH_HELPER_URL || "").trim();
	const token = (process.env.BEEPER_SYNCH_HELPER_TOKEN || "").trim();
	return Boolean(url && token);
}

function normalizeStatus(raw: unknown): PluginSynchUiStatus {
	if (typeof raw !== "string") return PLUGIN_NO_CONNECTION;
	if (KNOWN.has(raw)) return raw as PluginSynchUiStatus;
	return "unhealthy";
}

async function callHelper(
	reqPath: "/status" | "/start",
	method: "GET" | "POST",
): Promise<{ ok: boolean; status: PluginSynchUiStatus }> {
	if (!isLocalPluginSynchEnabled()) {
		return { ok: false, status: PLUGIN_NO_CONNECTION };
	}

	const base = process.env.BEEPER_SYNCH_HELPER_URL!.trim().replace(/\/$/, "");
	const token = process.env.BEEPER_SYNCH_HELPER_TOKEN!.trim();
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
	try {
		const res = await fetch(`${base}${reqPath}`, {
			method,
			headers: {
				Authorization: `Bearer ${token}`,
				Accept: "application/json",
			},
			signal: controller.signal,
			cache: "no-store",
		});
		const json = (await res.json().catch(() => ({}))) as {
			ok?: boolean;
			status?: string;
		};
		const status = normalizeStatus(json.status);
		const ok = Boolean(json.ok) && status === "running";
		return { ok, status };
	} catch {
		return { ok: false, status: PLUGIN_NO_CONNECTION };
	} finally {
		clearTimeout(timer);
	}
}

export async function getPluginSynchStatus(): Promise<{
	ok: boolean;
	status: PluginSynchUiStatus;
}> {
	return callHelper("/status", "GET");
}

export async function startPluginSynch(): Promise<{
	ok: boolean;
	status: PluginSynchUiStatus;
}> {
	return callHelper("/start", "POST");
}
