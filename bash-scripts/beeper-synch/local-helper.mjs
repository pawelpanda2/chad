#!/usr/bin/env node
/**
 * Local-only helper for Dashboard → beeper-synch (Story 105/106).
 * TCP 0.0.0.0:12701 + Bearer token. Allowlist: GET /status, POST /start.
 * After start/status, returns health-aware UI statuses (never "already running"
 * when Beeper auth/sync is unhealthy).
 */
import http from "node:http";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const RUNTIME_DIR = path.join(REPO_ROOT, ".runtime/beeper-synch");
const STATUS_FILE = path.join(RUNTIME_DIR, "status.json");
const RESTART_SCRIPT = path.join(__dirname, "restart.sh");
const MAC_ENV = path.join(REPO_ROOT, ".env.mac-beeper");
const PLIST_LABEL = "com.chad.beeper-synch";

const TOKEN = (process.env.BEEPER_SYNCH_HELPER_TOKEN || "").trim();
const OP_TIMEOUT_MS = Number(process.env.BEEPER_SYNCH_HELPER_TIMEOUT_MS || 45_000);
const HOST = (process.env.BEEPER_SYNCH_HELPER_HOST || "0.0.0.0").trim();
const PORT = Number(process.env.BEEPER_SYNCH_HELPER_PORT || 12701);

if (!TOKEN) {
	console.error("BEEPER_SYNCH_HELPER_TOKEN is required — refusing to start.");
	process.exit(1);
}

fs.mkdirSync(RUNTIME_DIR, { recursive: true });

let busy = false;

function authorize(req) {
	const header = req.headers.authorization || "";
	const match = /^Bearer\s+(.+)$/i.exec(header);
	return Boolean(match && match[1] === TOKEN);
}

function readEnvFile(filePath) {
	const out = {};
	if (!fs.existsSync(filePath)) return out;
	for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
		const t = line.trim();
		if (!t || t.startsWith("#")) continue;
		const i = t.indexOf("=");
		if (i <= 0) continue;
		out[t.slice(0, i)] = t.slice(i + 1).trim();
	}
	return out;
}

function readStatusJson() {
	try {
		if (!fs.existsSync(STATUS_FILE)) return null;
		return JSON.parse(fs.readFileSync(STATUS_FILE, "utf8"));
	} catch {
		return null;
	}
}

function launchAgentLoaded() {
	return new Promise((resolve) => {
		const child = spawn("launchctl", ["list"], { stdio: ["ignore", "pipe", "pipe"] });
		let out = "";
		child.stdout.on("data", (c) => {
			out += c.toString();
		});
		child.on("close", () => resolve(out.includes(PLIST_LABEL)));
		child.on("error", () => resolve(false));
	});
}

async function probeBeeperAuth() {
	const env = readEnvFile(MAC_ENV);
	const restUrl = (env.BEEPER_REST_URL || "http://localhost:23373").replace(/\/$/, "");
	const apiKey = env.BEEPER_API_KEY || "";
	if (!apiKey) {
		return {
			beeperDesktopReachable: false,
			authorizationStatus: "unknown",
			lastErrorCode: "missing_api_key",
			lastErrorMessageShort: "BEEPER_API_KEY not set",
		};
	}
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), 5_000);
	try {
		const res = await fetch(`${restUrl}/v1/app/setup`, {
			headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
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
			const json = JSON.parse(body);
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

/**
 * Health-first UI status. Never returns "already running" as a success mask
 * over token/sync failures.
 */
function mapToUiStatus({ loaded, statusJson, auth, phase }) {
	if (!loaded) {
		return phase === "after-start" ? { ok: false, status: "failed" } : { ok: false, status: "unhealthy" };
	}
	if (auth.authorizationStatus === "token_expired") {
		return { ok: false, status: "token expired" };
	}
	if (auth.authorizationStatus === "unauthorized") {
		return { ok: false, status: "unauthorized" };
	}
	if (auth.authorizationStatus === "unreachable") {
		return { ok: false, status: "unhealthy" };
	}

	const wsRunning = Boolean(statusJson?.wsRunning ?? statusJson?.beeperWs?.running ?? statusJson?.ready);
	const oplogRunning = Boolean(statusJson?.oplogRunning ?? statusJson?.beeperOplog?.running);
	const lastSyncExit = statusJson?.beeperSync?.lastExitCode ?? null;
	const syncFailed = lastSyncExit !== null && lastSyncExit !== 0;
	const healthyFile = statusJson?.healthy === true;
	const healthy =
		healthyFile ||
		(auth.authorizationStatus === "authorized" && wsRunning && oplogRunning && !syncFailed);

	if (syncFailed && auth.authorizationStatus === "authorized") {
		// Prefer auth errors first; sync failure when auth ok.
		if (!wsRunning) return { ok: false, status: "unhealthy" };
		return { ok: false, status: "sync failed" };
	}

	if (healthy && auth.authorizationStatus === "authorized" && wsRunning) {
		return { ok: true, status: "running" };
	}

	if (phase === "after-start") {
		return { ok: true, status: "starting" };
	}
	return { ok: false, status: "unhealthy" };
}

async function evaluateHealth(phase) {
	const loaded = await launchAgentLoaded();
	const statusJson = readStatusJson();
	const auth = await probeBeeperAuth();
	const mapped = mapToUiStatus({ loaded, statusJson, auth, phase });
	return {
		...mapped,
		supervisorRunning: loaded,
		wsRunning: Boolean(statusJson?.wsRunning ?? statusJson?.beeperWs?.running),
		oplogRunning: Boolean(statusJson?.oplogRunning ?? statusJson?.beeperOplog?.running),
		authorizationStatus: auth.authorizationStatus,
		healthy: mapped.status === "running",
		// Never include secrets.
	};
}

function runRestart() {
	return new Promise((resolve) => {
		const child = spawn("/bin/bash", [RESTART_SCRIPT], {
			cwd: REPO_ROOT,
			env: process.env,
			stdio: ["ignore", "pipe", "pipe"],
		});
		let stdout = "";
		let stderr = "";
		const timer = setTimeout(() => {
			child.kill("SIGKILL");
			resolve({ ok: false, code: -1, stdout, stderr: stderr || "timeout" });
		}, OP_TIMEOUT_MS);
		child.stdout.on("data", (c) => {
			stdout += c.toString();
		});
		child.stderr.on("data", (c) => {
			stderr += c.toString();
		});
		child.on("close", (code) => {
			clearTimeout(timer);
			resolve({ ok: code === 0, code: code ?? 1, stdout, stderr });
		});
		child.on("error", (err) => {
			clearTimeout(timer);
			resolve({ ok: false, code: -1, stdout, stderr: String(err) });
		});
	});
}

async function waitUntilLoaded(timeoutMs = 12_000) {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (await launchAgentLoaded()) return true;
		await new Promise((r) => setTimeout(r, 400));
	}
	return launchAgentLoaded();
}

async function waitForHealth(timeoutMs = 20_000) {
	const deadline = Date.now() + timeoutMs;
	let last = await evaluateHealth("after-start");
	while (Date.now() < deadline) {
		last = await evaluateHealth("after-start");
		if (
			last.status === "running" ||
			last.status === "token expired" ||
			last.status === "unauthorized" ||
			last.status === "sync failed"
		) {
			return last;
		}
		await new Promise((r) => setTimeout(r, 800));
	}
	return last;
}

async function handleStart() {
	if (busy) {
		return { ok: false, status: "failed", reason: "busy" };
	}
	busy = true;
	try {
		const result = await runRestart();
		if (!result.ok) {
			return { ok: false, status: "failed" };
		}
		const loaded = await waitUntilLoaded();
		if (!loaded) {
			return { ok: false, status: "failed" };
		}
		return waitForHealth();
	} finally {
		busy = false;
	}
}

function sendJson(res, statusCode, body) {
	const payload = JSON.stringify(body);
	res.writeHead(statusCode, {
		"Content-Type": "application/json; charset=utf-8",
		"Content-Length": Buffer.byteLength(payload),
	});
	res.end(payload);
}

async function onRequest(req, res) {
	if (!authorize(req)) {
		sendJson(res, 401, { ok: false, status: "failed" });
		return;
	}
	const url = new URL(req.url || "/", "http://helper.local");
	try {
		if (req.method === "GET" && url.pathname === "/status") {
			const body = await evaluateHealth("status");
			sendJson(res, 200, body);
			return;
		}
		if (req.method === "POST" && url.pathname === "/start") {
			const body = await handleStart();
			const http =
				body.status === "running" || body.status === "starting" || body.status === "started"
					? 200
					: body.status === "token expired" || body.status === "unauthorized" || body.status === "sync failed"
						? 200
						: 500;
			sendJson(res, http, body);
			return;
		}
		sendJson(res, 404, { ok: false, status: "failed" });
	} catch {
		sendJson(res, 500, { ok: false, status: "failed" });
	}
}

const server = http.createServer((req, res) => {
	void onRequest(req, res);
});

server.listen(PORT, HOST, () => {
	console.log(`beeper-synch helper listening on http://${HOST}:${PORT}`);
});
