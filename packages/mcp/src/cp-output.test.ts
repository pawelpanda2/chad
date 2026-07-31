import { describe, it, expect } from "vitest";
import { addressFromLoca, isValidLoca, toCpItemOutput } from "./cp-output.js";
import type { CpItem } from "dba";

describe("isValidLoca", () => {
  it("accepts the empty string (repo root)", () => {
    expect(isValidLoca("")).toBe(true);
  });
  it("accepts valid numeric segments", () => {
    expect(isValidLoca("03")).toBe(true);
    expect(isValidLoca("03/21/05")).toBe(true);
    expect(isValidLoca("001/002")).toBe(true);
  });
  it("rejects non-numeric or malformed paths", () => {
    expect(isValidLoca("leads")).toBe(false);
    expect(isValidLoca("03/leads")).toBe(false);
    expect(isValidLoca("../03")).toBe(false);
    expect(isValidLoca("03//05")).toBe(false);
    expect(isValidLoca("/03")).toBe(false);
    expect(isValidLoca("03/")).toBe(false);
  });
  it("rejects an attempt to smuggle a full address (repoGuid prefix) as a loca", () => {
    expect(isValidLoca("21d11bdc-f1f4-44d1-b61a-3fa6b039c641/03")).toBe(false);
  });
});

describe("addressFromLoca", () => {
  const repoGuid = "5a9c8b7d-6e5f-4a3b-2c1d-0e9f8a7b6c5d";
  it("returns the bare repoGuid for an empty loca", () => {
    expect(addressFromLoca(repoGuid, "")).toBe(repoGuid);
  });
  it("joins repoGuid and loca with a single slash", () => {
    expect(addressFromLoca(repoGuid, "03/21")).toBe(`${repoGuid}/03/21`);
  });
});

describe("toCpItemOutput", () => {
  it("shapes a CpItem into id/address/type/name/config/body, splitting out custom config fields", () => {
    const item: CpItem = {
      _id: "abc",
      config: { id: "abc", address: "repo/03", type: "Text", name: "hello", created: "260101_000000" },
      body: "some body",
    };
    const out = toCpItemOutput(item);
    expect(out).toMatchObject({
      id: "abc",
      address: "repo/03",
      type: "Text",
      name: "hello",
      body: "some body",
      config: { created: "260101_000000" },
    });
    expect(out.legacyFieldNote).toBeTruthy();
    expect(out.config).not.toHaveProperty("id");
    expect(out.config).not.toHaveProperty("address");
  });
});
