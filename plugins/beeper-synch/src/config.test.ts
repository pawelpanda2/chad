/**
 * config.ts tests. Run via: tsx src/config.test.ts
 *
 * Uses a non-existent envFilePath in every test so results depend only on
 * the injected `env` object, never on this machine's real .env.mac-beeper
 * (which does exist on the owner's Mac and would otherwise silently fill in
 * missing values, masking the validation this file tests).
 */
import { ConfigError, loadConfig } from "./config.js";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${e}`);
    failed++;
  }
}

function assertTrue(cond: boolean, message: string): void {
  if (!cond) throw new Error(message);
}

const NO_FILE = "/nonexistent/.env.mac-beeper-test-placeholder";
const VALID_GUID = "21d11bdc-f1f4-44d1-b61a-3fa6b039c641";

function baseEnv(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    MONGODB_URI: "mongodb://user:pass@100.117.139.83:12041/?authSource=admin",
    BEEPER_REST_URL: "http://localhost:23373",
    BEEPER_WS_URL: "ws://localhost:23373/v1/ws",
    BEEPER_API_KEY: "test-key",
    BEEPER_OWNER_REPO_GUID: VALID_GUID,
  };
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) delete env[k];
    else env[k] = v;
  }
  return env;
}

console.log("Running config.ts tests...\n");

test("valid env loads a Config with expected defaults", () => {
  const config = loadConfig(baseEnv(), NO_FILE);
  assertTrue(config.ownerRepoGuid === VALID_GUID, "ownerRepoGuid must match env");
  assertTrue(config.syncIntervalMs === 5 * 60 * 1000, `expected default 300000, got ${config.syncIntervalMs}`);
  assertTrue(config.instanceId === "mac-default", "instanceId must default to mac-default");
  assertTrue(config.beeperWsDir.endsWith("packages/beeper-ws"), "beeperWsDir must point at packages/beeper-ws");
  assertTrue(config.beeperSyncDir.endsWith("packages/beeper-sync"), "beeperSyncDir must point at packages/beeper-sync");
  assertTrue(config.beeperOplogDir.endsWith("packages/beeper-oplog"), "beeperOplogDir must point at packages/beeper-oplog");
});

test("missing MONGODB_URI throws ConfigError", () => {
  let threw = false;
  try {
    loadConfig(baseEnv({ MONGODB_URI: undefined }), NO_FILE);
  } catch (err) {
    threw = err instanceof ConfigError;
  }
  assertTrue(threw, "expected ConfigError when MONGODB_URI is missing");
});

test("missing BEEPER_API_KEY throws ConfigError", () => {
  let threw = false;
  try {
    loadConfig(baseEnv({ BEEPER_API_KEY: undefined }), NO_FILE);
  } catch (err) {
    threw = err instanceof ConfigError;
  }
  assertTrue(threw, "expected ConfigError when BEEPER_API_KEY is missing");
});

test("missing BEEPER_OWNER_REPO_GUID throws (no user fallback ever)", () => {
  let threw = false;
  try {
    loadConfig(baseEnv({ BEEPER_OWNER_REPO_GUID: undefined }), NO_FILE);
  } catch {
    threw = true;
  }
  assertTrue(threw, "expected an error when BEEPER_OWNER_REPO_GUID is missing");
});

test("malformed BEEPER_OWNER_REPO_GUID throws (no partial-GUID acceptance)", () => {
  let threw = false;
  try {
    loadConfig(baseEnv({ BEEPER_OWNER_REPO_GUID: "not-a-guid" }), NO_FILE);
  } catch {
    threw = true;
  }
  assertTrue(threw, "expected an error for a malformed GUID");
});

test("BEEPER_SYNCH_SYNC_INTERVAL_MS override is honored", () => {
  const config = loadConfig(baseEnv({ BEEPER_SYNCH_SYNC_INTERVAL_MS: "60000" }), NO_FILE);
  assertTrue(config.syncIntervalMs === 60_000, `expected 60000, got ${config.syncIntervalMs}`);
});

test("invalid BEEPER_SYNCH_SYNC_INTERVAL_MS (non-numeric) throws ConfigError", () => {
  let threw = false;
  try {
    loadConfig(baseEnv({ BEEPER_SYNCH_SYNC_INTERVAL_MS: "not-a-number" }), NO_FILE);
  } catch (err) {
    threw = err instanceof ConfigError;
  }
  assertTrue(threw, "expected ConfigError for a non-numeric interval override");
});

test("localMirrorMongoUri defaults to local Mongo, separate from MONGODB_URI", () => {
  const config = loadConfig(baseEnv(), NO_FILE);
  assertTrue(
    config.localMirrorMongoUri === "mongodb://localhost:27017/?directConnection=true",
    `unexpected default localMirrorMongoUri: ${config.localMirrorMongoUri}`
  );
  assertTrue(config.mirrorIntervalMs === 5 * 60 * 1000, `expected default mirror interval 300000, got ${config.mirrorIntervalMs}`);
});

test("refuses to start when the local mirror target resolves to the same host as MONGODB_URI", () => {
  let threw = false;
  try {
    loadConfig(
      baseEnv({ BEEPER_LOCAL_MIRROR_MONGODB_URI: "mongodb://x:y@100.117.139.83:12041/?authSource=admin" }),
      NO_FILE
    );
  } catch (err) {
    threw = err instanceof ConfigError;
  }
  assertTrue(threw, "expected ConfigError when local mirror target == source host");
});

test("BEEPER_SYNCH_MIRROR_INTERVAL_MS override is honored", () => {
  const config = loadConfig(baseEnv({ BEEPER_SYNCH_MIRROR_INTERVAL_MS: "45000" }), NO_FILE);
  assertTrue(config.mirrorIntervalMs === 45_000, `expected 45000, got ${config.mirrorIntervalMs}`);
});

test("config never carries the raw BEEPER_API_KEY into a loggable field", () => {
  const config = loadConfig(baseEnv(), NO_FILE);
  const serialized = JSON.stringify(config);
  assertTrue(!serialized.includes("test-key"), "BEEPER_API_KEY must not appear anywhere in the Config object");
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
