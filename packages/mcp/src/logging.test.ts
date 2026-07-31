import { describe, it, expect, vi, afterEach } from "vitest";
import { redact, createLogger } from "./logging.js";

describe("redact", () => {
  it("redacts credentials embedded in a connection string", () => {
    const out = redact("connecting to postgres://chad:sup3rSecret@localhost:5433/chad");
    expect(out).not.toContain("sup3rSecret");
    expect(out).toContain("postgres://<redacted>@localhost:5433/chad");
  });

  it("redacts a bearer token", () => {
    const out = redact("Authorization: Bearer abc123def456");
    expect(out).not.toContain("abc123def456");
  });

  it("redacts a password= assignment", () => {
    const out = redact("password=hunter2 rest of message");
    expect(out).not.toContain("hunter2");
  });

  it("leaves ordinary text untouched", () => {
    expect(redact("cp_get_item called for loca 03/21/05")).toBe("cp_get_item called for loca 03/21/05");
  });
});

describe("createLogger", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes to stderr, never stdout", () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const logger = createLogger("debug");
    logger.info("hello");
    expect(stderrSpy).toHaveBeenCalledOnce();
    expect(stdoutSpy).not.toHaveBeenCalled();
  });

  it("redacts secrets found in meta objects", () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const logger = createLogger("debug");
    logger.info("connected", { uri: "postgres://chad:sup3rSecret@localhost:5433/chad" });
    const written = stderrSpy.mock.calls[0][0] as string;
    expect(written).not.toContain("sup3rSecret");
  });

  it("suppresses messages below the configured level", () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const logger = createLogger("warn");
    logger.info("should not appear");
    expect(stderrSpy).not.toHaveBeenCalled();
    logger.warn("should appear");
    expect(stderrSpy).toHaveBeenCalledOnce();
  });
});
