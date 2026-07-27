import { afterEach, describe, expect, it } from "vitest";
import {
  chadPostgresSourceToLabel,
  labelToChadPostgresSource,
  maskUriHostPort,
  parseHostPort,
} from "../../../packages/dba/src/dev-data-source.js";
import {
  assertChadWriteAllowed,
  getChadDataMode,
  isOfflineReadonlyBackupMode,
  OfflineReadonlyBackupWriteForbiddenError,
} from "../../../packages/dba/src/chad-data-mode.js";

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
