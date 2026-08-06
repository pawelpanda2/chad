/**
 * Closed Dashboard ↔ host beeper-synch helper client (Story 105).
 *
 * HTTP to host helper only when CHAD_ENVIRONMENT=local and URL+token set.
 * No command/path/args from the browser.
 */

export const PLUGIN_NO_CONNECTION = "error no connection to plugin" as const;

export type PluginSynchUiStatus =
	| "running"
	| "started"
	| "already running"
	| "failed"
	| typeof PLUGIN_NO_CONNECTION
	| "";

const DEFAULT_TIMEOUT_MS = 15_000;

export function isLocalPluginSynchEnabled(): boolean {
	const chadEnv = process.env.CHAD_ENVIRONMENT;
	if (chadEnv === "test" || chadEnv === "prod") return false;
	if (chadEnv !== "local") return false;
	const url = (process.env.BEEPER_SYNCH_HELPER_URL || "").trim();
	const token = (process.env.BEEPER_SYNCH_HELPER_TOKEN || "").trim();
	return Boolean(url && token);
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
			running?: boolean;
		};

		if (reqPath === "/status") {
			if (json.running || json.status === "running") {
				return { ok: true, status: "running" };
			}
			return { ok: true, status: "" };
		}

		const s = json.status;
		if (s === "started" || s === "already running" || s === "failed") {
			return { ok: Boolean(json.ok ?? s !== "failed"), status: s };
		}
		if (s === "running") {
			return { ok: true, status: "started" };
		}
		return { ok: false, status: res.ok ? "failed" : "failed" };
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
