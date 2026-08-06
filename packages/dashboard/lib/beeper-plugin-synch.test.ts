import { afterEach, describe, expect, it, vi } from "vitest";
import {
	getPluginSynchStatus,
	isLocalPluginSynchEnabled,
	isPluginSynchErrorStatus,
	pluginSynchStatusMessage,
	PLUGIN_NO_CONNECTION,
	startPluginSynch,
} from "./beeper-plugin-synch";

describe("beeper-plugin-synch health statuses (Story 106)", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("marks token expired as error status", () => {
		expect(isPluginSynchErrorStatus("token expired")).toBe(true);
		expect(isPluginSynchErrorStatus("running")).toBe(false);
		expect(isPluginSynchErrorStatus("already running")).toBe(false);
	});

	it("explains token expired without secrets", () => {
		const msg = pluginSynchStatusMessage("token expired");
		expect(msg.toLowerCase()).toContain("token expired");
		expect(msg).toContain("BEEPER_API_KEY");
		expect(msg).not.toMatch(/bdapi_|Bearer |[a-f0-9]{32}/i);
	});

	it("test/prod → no connection without fetch", async () => {
		vi.stubEnv("CHAD_ENVIRONMENT", "test");
		vi.stubEnv("BEEPER_SYNCH_HELPER_URL", "http://host.docker.internal:12701");
		vi.stubEnv("BEEPER_SYNCH_HELPER_TOKEN", "secret");
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		await expect(startPluginSynch()).resolves.toEqual({
			ok: false,
			status: PLUGIN_NO_CONNECTION,
		});
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("passes through token expired from helper (not already running)", async () => {
		vi.stubEnv("CHAD_ENVIRONMENT", "local");
		vi.stubEnv("BEEPER_SYNCH_HELPER_URL", "http://host.docker.internal:12701");
		vi.stubEnv("BEEPER_SYNCH_HELPER_TOKEN", "tok");
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({
				ok: true,
				json: async () => ({ ok: false, status: "token expired" }),
			})),
		);
		await expect(startPluginSynch()).resolves.toEqual({
			ok: false,
			status: "token expired",
		});
	});

	it("maps healthy helper status to running", async () => {
		vi.stubEnv("CHAD_ENVIRONMENT", "local");
		vi.stubEnv("BEEPER_SYNCH_HELPER_URL", "http://host.docker.internal:12701");
		vi.stubEnv("BEEPER_SYNCH_HELPER_TOKEN", "tok");
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({
				ok: true,
				json: async () => ({ ok: true, status: "running" }),
			})),
		);
		await expect(getPluginSynchStatus()).resolves.toEqual({ ok: true, status: "running" });
	});

	it("does not treat already running as ok success", async () => {
		vi.stubEnv("CHAD_ENVIRONMENT", "local");
		vi.stubEnv("BEEPER_SYNCH_HELPER_URL", "http://host.docker.internal:12701");
		vi.stubEnv("BEEPER_SYNCH_HELPER_TOKEN", "tok");
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({
				ok: true,
				json: async () => ({ ok: true, status: "already running" }),
			})),
		);
		const result = await startPluginSynch();
		expect(result.status).toBe("already running");
		expect(result.ok).toBe(false);
	});

	it("requires local URL+token", () => {
		vi.stubEnv("CHAD_ENVIRONMENT", "local");
		vi.stubEnv("BEEPER_SYNCH_HELPER_URL", "");
		vi.stubEnv("BEEPER_SYNCH_HELPER_TOKEN", "x");
		expect(isLocalPluginSynchEnabled()).toBe(false);
	});
});
