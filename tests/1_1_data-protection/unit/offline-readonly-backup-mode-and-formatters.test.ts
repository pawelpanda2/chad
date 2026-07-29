import { afterEach, describe, expect, it } from "vitest";
import {
  beeperMongoSourceToLabel,
  chadPostgresSourceToLabel,
  labelToBeeperMongoSource,
  labelToChadPostgresSource,
  maskUriHostPort,
  parseHostPort,
} from "../../../packages/dba/src/dev-data-source.js";
import {
  assertBeeperWriteAllowed,
  assertChadWriteAllowed,
  BeeperMongoReadonlyWriteForbiddenError,
  getChadDataMode,
  isBeeperMongoReadonlyMode,
  isOfflineReadonlyBackupMode,
  OfflineReadonlyBackupWriteForbiddenError,
} from "../../../packages/dba/src/chad-data-mode.js";
import {
  getEffectiveBeeperMongoUri,
  getMongoSource,
  setMongoSource,
} from "../../../packages/dba/src/dev-db-override.js";

describe("offline-readonly-backup — source mapping", () => {
  it("maps postgres sources to labels", () => {
    expect(chadPostgresSourceToLabel("server")).toBe("Server PostgreSQL");
    expect(chadPostgresSourceToLabel("offline-readonly-backup")).toBe("offline-readonly-backup");
  });

  it("parses labels back to sources", () => {
    expect(labelToChadPostgresSource("Server PostgreSQL")).toBe("server");
    expect(labelToChadPostgresSource("offline-readonly-backup")).toBe("offline-readonly-backup");
    expect(labelToChadPostgresSource("local")).toBeNull();
  });
});

describe("beeper mongo — source mapping", () => {
  it("maps mongo sources to Dev Panel labels", () => {
    expect(beeperMongoSourceToLabel("qnap")).toBe("Server Mongo");
    expect(beeperMongoSourceToLabel("local")).toBe("Local readonly backup");
  });

  it("parses labels back to sources", () => {
    expect(labelToBeeperMongoSource("Server Mongo")).toBe("qnap");
    expect(labelToBeeperMongoSource("Local readonly backup")).toBe("local");
    expect(labelToBeeperMongoSource("qnap")).toBe("qnap");
    expect(labelToBeeperMongoSource("local")).toBe("local");
    expect(labelToBeeperMongoSource("offline-readonly-backup")).toBeNull();
  });
});

describe("offline-readonly-backup — secret masking", () => {
  it("masks postgres URI credentials", () => {
    expect(maskUriHostPort("postgres://user:secret@100.117.139.83:12042/chad")).toBe(
      "100.117.139.83:12042"
    );
  });

  it("parses host and port", () => {
    expect(parseHostPort("127.0.0.1:55432")).toEqual({ host: "127.0.0.1", port: "55432" });
  });
});

describe("offline-readonly-backup — mode guards", () => {
  const prev = process.env.CHAD_DATA_MODE;

  afterEach(() => {
    if (prev === undefined) delete process.env.CHAD_DATA_MODE;
    else process.env.CHAD_DATA_MODE = prev;
  });

  it("detects offline mode from env", () => {
    process.env.CHAD_DATA_MODE = "offline-readonly-backup";
    expect(isOfflineReadonlyBackupMode()).toBe(true);
    expect(getChadDataMode()).toBe("offline-readonly-backup");
  });

  it("blocks writes in offline mode", () => {
    process.env.CHAD_DATA_MODE = "offline-readonly-backup";
    expect(() => assertChadWriteAllowed()).toThrow(OfflineReadonlyBackupWriteForbiddenError);
  });

  it("allows writes in remote-primary mode", () => {
    process.env.CHAD_DATA_MODE = "remote-primary";
    expect(() => assertChadWriteAllowed()).not.toThrow();
  });
});

describe("beeper mongo — Server URI ignores dead :12040 env", () => {
  const prevEnv = {
    CHAD_ENVIRONMENT: process.env.CHAD_ENVIRONMENT,
    BEEPER_MONGODB_URI: process.env.BEEPER_MONGODB_URI,
    BEEPER_MONGO_ROOT_USERNAME: process.env.BEEPER_MONGO_ROOT_USERNAME,
    BEEPER_MONGO_ROOT_PASSWORD: process.env.BEEPER_MONGO_ROOT_PASSWORD,
    DEV_DB_SOURCE_PREF_PATH: process.env.DEV_DB_SOURCE_PREF_PATH,
  };

  afterEach(() => {
    for (const [k, v] of Object.entries(prevEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("rebuilds :12041 with BEEPER_MONGO_ROOT_* when env points at :12040", () => {
    process.env.CHAD_ENVIRONMENT = "local";
    process.env.DEV_DB_SOURCE_PREF_PATH = `/tmp/chad-dev-db-source-test-${Date.now()}.json`;
    process.env.BEEPER_MONGODB_URI =
      "mongodb://wrong:wrong@100.117.139.83:12040?authSource=admin&directConnection=true";
    process.env.BEEPER_MONGO_ROOT_USERNAME = "beeper_user";
    process.env.BEEPER_MONGO_ROOT_PASSWORD = "beeper_pass";
    setMongoSource("qnap");
    expect(getMongoSource()).toBe("qnap");
    const uri = getEffectiveBeeperMongoUri();
    expect(uri).toContain(":12041");
    expect(uri).not.toContain(":12040");
    expect(uri).toContain("beeper_user");
  });
});

describe("beeper mongo — local readonly write guard", () => {
  const prevEnv = {
    CHAD_ENVIRONMENT: process.env.CHAD_ENVIRONMENT,
    DEV_DB_SOURCE_PREF_PATH: process.env.DEV_DB_SOURCE_PREF_PATH,
  };

  afterEach(() => {
    for (const [k, v] of Object.entries(prevEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    try {
      process.env.CHAD_ENVIRONMENT = "local";
      process.env.DEV_DB_SOURCE_PREF_PATH = `/tmp/chad-dev-db-source-test-reset-${Date.now()}.json`;
      setMongoSource("qnap");
    } catch {
      // ignore if assertLocalDev fails in CI without local env
    }
  });

  it("blocks writes when mongo source is local", () => {
    process.env.CHAD_ENVIRONMENT = "local";
    process.env.DEV_DB_SOURCE_PREF_PATH = `/tmp/chad-dev-db-source-test-local-${Date.now()}.json`;
    setMongoSource("local");
    expect(isBeeperMongoReadonlyMode()).toBe(true);
    expect(() => assertBeeperWriteAllowed()).toThrow(BeeperMongoReadonlyWriteForbiddenError);
  });

  it("allows writes when mongo source is Server Mongo", () => {
    process.env.CHAD_ENVIRONMENT = "local";
    process.env.DEV_DB_SOURCE_PREF_PATH = `/tmp/chad-dev-db-source-test-qnap-${Date.now()}.json`;
    setMongoSource("qnap");
    expect(isBeeperMongoReadonlyMode()).toBe(false);
    expect(() => assertBeeperWriteAllowed()).not.toThrow();
  });
});
