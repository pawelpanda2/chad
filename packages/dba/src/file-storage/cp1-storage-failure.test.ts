import { describe, expect, it } from "vitest";
import { isCp1StorageFailure } from "./cp1-storage-failure.js";

describe("isCp1StorageFailure", () => {
  it("does not treat plain ENOENT as storage failure", () => {
    const err = Object.assign(new Error("no such file"), { code: "ENOENT" });
    expect(isCp1StorageFailure(err)).toBe(false);
  });

  it("detects EBADF / ENOTDIR / EIO / EPERM", () => {
    for (const code of ["EBADF", "ENOTDIR", "EIO", "EPERM"]) {
      const err = Object.assign(new Error(code), { code });
      expect(isCp1StorageFailure(err)).toBe(true);
    }
  });

  it("detects Bad file descriptor message", () => {
    expect(isCp1StorageFailure(new Error("Bad file descriptor"))).toBe(true);
  });

  it("isCp1DegradedMode reads CHAD_CP1_MODE", async () => {
    const { isCp1DegradedMode } = await import("./cp1-storage-failure.js");
    const prev = process.env.CHAD_CP1_MODE;
    try {
      process.env.CHAD_CP1_MODE = "degraded";
      expect(isCp1DegradedMode()).toBe(true);
      process.env.CHAD_CP1_MODE = "healthy";
      expect(isCp1DegradedMode()).toBe(false);
    } finally {
      if (prev === undefined) delete process.env.CHAD_CP1_MODE;
      else process.env.CHAD_CP1_MODE = prev;
    }
  });
});
