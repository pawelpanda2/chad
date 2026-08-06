import { afterEach, describe, expect, it, vi } from "vitest";
import {
	getPluginSynchStatus,
	isLocalPluginSynchEnabled,
	PLUGIN_NO_CONNECTION,
	startPluginSynch,
} from "./beeper-plugin-synch";

describe("beeper-plugin-synch", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("disables outside CHAD_ENVIRONMENT=local", () => {
		vi.stubEnv("CHAD_ENVIRONMENT", "test");
		vi.stubEnv("BEEPER_SYNCH_HELPER_URL", "http://host.docker.internal:12701");
		vi.stubEnv("BEEPER_SYNCH_HELPER_TOKEN", "secret");
		expect(isLocalPluginSynchEnabled()).toBe(false);
	});

	it("disables on prod even with helper env", () => {
		vi.stubEnv("CHAD_ENVIRONMENT", "prod");
		vi.stubEnv("BEEPER_SYNCH_HELPER_URL", "http://127.0.0.1:12701");
		vi.stubEnv("BEEPER_SYNCH_HELPER_TOKEN", "secret");
		expect(isLocalPluginSynchEnabled()).toBe(false);
	});

	it("requires both URL and token in local", () => {
		vi.stubEnv("CHAD_ENVIRONMENT", "local");
		vi.stubEnv("BEEPER_SYNCH_HELPER_URL", "http://host.docker.internal:12701");
		vi.stubEnv("BEEPER_SYNCH_HELPER_TOKEN", "");
		expect(isLocalPluginSynchEnabled()).toBe(false);
	});

	it("returns exact no-connection when helper unreachable", async () => {
		vi.stubEnv("CHAD_ENVIRONMENT", "local");
		vi.stubEnv("BEEPER_SYNCH_HELPER_URL", "http://127.0.0.1:1");
		vi.stubEnv("BEEPER_SYNCH_HELPER_TOKEN", "secret");
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new Error("ECONNREFUSED");
			}),
		);
		await expect(getPluginSynchStatus()).resolves.toEqual({
			ok: false,
			status: PLUGIN_NO_CONNECTION,
		});
		await expect(startPluginSynch()).resolves.toEqual({
			ok: false,
			status: PLUGIN_NO_CONNECTION,
		});
	});

	it("maps helper running status", async () => {
		vi.stubEnv("CHAD_ENVIRONMENT", "local");
		vi.stubEnv("BEEPER_SYNCH_HELPER_URL", "http://host.docker.internal:12701");
		vi.stubEnv("BEEPER_SYNCH_HELPER_TOKEN", "tok");
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({
				ok: true,
				json: async () => ({ ok: true, status: "running", running: true }),
			})),
		);
		await expect(getPluginSynchStatus()).resolves.toEqual({ ok: true, status: "running" });
	});

	it("maps start already running without leaking secrets", async () => {
		vi.stubEnv("CHAD_ENVIRONMENT", "local");
		vi.stubEnv("BEEPER_SYNCH_HELPER_URL", "http://host.docker.internal:12701/");
		vi.stubEnv("BEEPER_SYNCH_HELPER_TOKEN", "tok");
		const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
			expect(init?.headers).toMatchObject({ Authorization: "Bearer tok" });
			return {
				ok: true,
				json: async () => ({ ok: true, status: "already running" }),
			};
		});
		vi.stubGlobal("fetch", fetchMock);
		const result = await startPluginSynch();
		expect(result).toEqual({ ok: true, status: "already running" });
		expect(JSON.stringify(result)).not.toContain("tok");
		expect(fetchMock.mock.calls[0][0]).toBe("http://host.docker.internal:12701/start");
	});

	it("test/prod path returns no-connection without calling fetch", async () => {
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
});
