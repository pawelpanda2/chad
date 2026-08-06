#!/usr/bin/env node
/**
 * Local-only helper for Dashboard → beeper-synch (Story 105).
 *
 * Listens on TCP for local Mac Docker (host.docker.internal). Docker Desktop
 * on Mac cannot use host Unix sockets across virtiofs (ENOTSUP), and
 * 127.0.0.1-only listeners are unreachable from the VM — so the bind defaults
 * to 0.0.0.0 on a high port. Mitigations: Bearer token, allowlist only,
 * Dashboard gate CHAD_ENVIRONMENT=local, never reverse-proxy, never QNAP.
 *
 * Override: BEEPER_SYNCH_HELPER_HOST=127.0.0.1 for host-only debug.
 *
 * Allowlist: GET /status, POST /start → official restart.sh only.
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
const PLIST_LABEL = "com.chad.beeper-synch";

const TOKEN = (process.env.BEEPER_SYNCH_HELPER_TOKEN || "").trim();
const OP_TIMEOUT_MS = Number(process.env.BEEPER_SYNCH_HELPER_TIMEOUT_MS || 20_000);
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

function readPluginReady() {
	try {
		if (!fs.existsSync(STATUS_FILE)) return { ready: false };
		const raw = JSON.parse(fs.readFileSync(STATUS_FILE, "utf8"));
		return { ready: Boolean(raw?.ready) };
	} catch {
		return { ready: false };
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

async function getStatusPayload() {
	const loaded = await launchAgentLoaded();
	const { ready } = readPluginReady();
	const running = loaded && ready;
	return {
		ok: true,
		status: running ? "running" : "stopped",
		running,
		loaded,
		ready,
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

async function handleStart() {
	if (busy) {
		return { ok: false, status: "failed", reason: "busy" };
	}
	busy = true;
	try {
		const before = await getStatusPayload();
		const result = await runRestart();
		if (!result.ok) {
			return { ok: false, status: "failed" };
		}
		await new Promise((r) => setTimeout(r, 800));
		const after = await getStatusPayload();
		if (!after.running) {
			return { ok: false, status: "failed" };
		}
		if (before.running) {
			return { ok: true, status: "already running" };
		}
		return { ok: true, status: "started" };
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
			sendJson(res, 200, await getStatusPayload());
			return;
		}
		if (req.method === "POST" && url.pathname === "/start") {
			const body = await handleStart();
			sendJson(res, body.ok ? 200 : 500, body);
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
