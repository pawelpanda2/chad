import { describe, expect, it } from "vitest";
import {
  effectiveReportAddress,
  listReportCategories,
  listReportsInCategory,
  reportCategoryDisplayName,
  type ReportBrowseOps,
} from "./report-browse.js";
import type { CpItem } from "./cp-model.js";

const REPO = "repo-guid";

function folder(address: string, name: string): CpItem {
  return { _id: `id-${address}`, config: { id: `id-${address}`, address, type: "Folder", name }, body: "" };
}

function text(address: string, name: string, body = ""): CpItem {
  return { _id: `id-${address}`, config: { id: `id-${address}`, address, type: "Text", name }, body };
}

function makeOps(items: CpItem[]): ReportBrowseOps {
  return {
    resolveByNames: async (names) => {
      if (names.length === 1 && names[0] === "reports") {
        return items.find((i) => i.config.address === `${REPO}/01` && i.config.name === "reports") ?? null;
      }
      return null;
    },
    getChildrenOf: async (parentAddress) =>
      items.filter((item) => {
        const prefix = `${parentAddress}/`;
        if (!item.config.address.startsWith(prefix)) return false;
        return !item.config.address.slice(prefix.length).includes("/");
      }),
    getItemByAddress: async (address) => items.find((i) => i.config.address === address) ?? null,
  };
}

describe("reportCategoryDisplayName", () => {
  it("strips only a leading numeric prefix + space", () => {
    expect(reportCategoryDisplayName("02 raporty; nieułożone")).toBe("raporty; nieułożone");
    expect(reportCategoryDisplayName("05 daygame; podejscia krótkie")).toBe("daygame; podejscia krótkie");
    expect(reportCategoryDisplayName("32 daygame; feedback chatgpt")).toBe("daygame; feedback chatgpt");
  });

  it("keeps digits in the middle or end of the name", () => {
    expect(reportCategoryDisplayName("daygame; v2 notes")).toBe("daygame; v2 notes");
    expect(reportCategoryDisplayName("06 daygame; room 12")).toBe("daygame; room 12");
  });
});

describe("effectiveReportAddress", () => {
  it("uses auto when user is unset; none when explicit none; else user address", () => {
    expect(effectiveReportAddress("a1", { status: "unset" })).toBe("a1");
    expect(effectiveReportAddress(null, { status: "unset" })).toBeNull();
    expect(effectiveReportAddress("a1", { status: "none" })).toBeNull();
    expect(effectiveReportAddress("a1", { status: "report", address: "u9" })).toBe("u9");
  });
});

describe("listReportCategories", () => {
  it("returns Folder children with stripped display names in folder order", async () => {
    const ops = makeOps([
      folder(REPO, "root"),
      folder(`${REPO}/01`, "reports"),
      folder(`${REPO}/01/01`, "02 raporty; nieułożone"),
      folder(`${REPO}/01/02`, "06 daygame; full report"),
      text(`${REPO}/01/03`, "should-not-appear", "text under reports"),
    ]);
    const cats = await listReportCategories(ops);
    expect(cats.map((c) => c.displayName)).toEqual(["raporty; nieułożone", "daygame; full report"]);
    expect(cats[0]?.logicalName).toBe("02 raporty; nieułożone");
    expect(cats[0]?.id).toBe(`${REPO}/01/01`);
  });

  it("returns [] when reports folder is missing", async () => {
    expect(await listReportCategories(makeOps([folder(REPO, "root")]))).toEqual([]);
  });
});

describe("listReportsInCategory", () => {
  it("returns only Text children", async () => {
    const ops = makeOps([
      folder(REPO, "root"),
      folder(`${REPO}/01`, "reports"),
      folder(`${REPO}/01/02`, "06 daygame; full report"),
      text(`${REPO}/01/02/01`, "25-10-03; Warszawa; Złote tarasy", "line1\nline2"),
      folder(`${REPO}/01/02/02`, "nested folder"),
      text(`${REPO}/01/02/03`, "other report", "x"),
    ]);
    const list = await listReportsInCategory(`${REPO}/01/02`, ops);
    expect(list.map((r) => r.name)).toEqual(["25-10-03; Warszawa; Złote tarasy", "other report"]);
    expect(list[0]?.preview).toBe("line1\nline2");
  });
});
