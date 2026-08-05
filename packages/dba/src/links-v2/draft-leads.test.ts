import { describe, expect, it } from "vitest";
import { buildDraftLeadName } from "./draft-leads.js";

const NOW = new Date("2026-08-05T12:00:00.000Z");

describe("buildDraftLeadName", () => {
  it("builds a YY-MM-DD_dl_<name> lead name", () => {
    const used = new Set<string>();
    const name = buildDraftLeadName({ displayName: "Anna Kowalska", phoneDigits: ["600123456"] }, used, NOW);
    expect(name).toBe("26-08-05_dl_Anna_Kowalska");
  });

  it("falls back to the phone digits when there is no display name", () => {
    const used = new Set<string>();
    const name = buildDraftLeadName({ displayName: "", phoneDigits: ["600123456"] }, used, NOW);
    expect(name).toBe("26-08-05_dl_600123456");
  });

  it("strips diacritics and non-alphanumerics", () => {
    const used = new Set<string>();
    const name = buildDraftLeadName({ displayName: "Michał Żółć!", phoneDigits: ["600123456"] }, used, NOW);
    expect(name).toBe("26-08-05_dl_Michal_Zolc");
  });

  it("suffixes on collision so two same-named contacts in one run never collide", () => {
    const used = new Set<string>();
    const first = buildDraftLeadName({ displayName: "Anna", phoneDigits: ["600111111"] }, used, NOW);
    const second = buildDraftLeadName({ displayName: "Anna", phoneDigits: ["600222222"] }, used, NOW);
    expect(first).not.toBe(second);
    expect(second).toBe("26-08-05_dl_Anna_2");
  });

  it("respects names already used before this call (e.g. real leads sharing the base name)", () => {
    const used = new Set<string>(["26-08-05_dl_Anna"]);
    const name = buildDraftLeadName({ displayName: "Anna", phoneDigits: ["600111111"] }, used, NOW);
    expect(name).toBe("26-08-05_dl_Anna_2");
  });
});
