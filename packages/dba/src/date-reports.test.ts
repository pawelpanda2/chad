import { describe, expect, it } from "vitest";
import {
  getDateReportTextByAddress,
  listDateReportChildren,
  listDateReports,
  type DateReportsOps,
} from "./date-reports.js";
import type { CpItem } from "./cp-model.js";

const REPO = "repo-guid";
const OTHER = "other-repo";

function folder(address: string, name: string): CpItem {
  return { _id: `id-${address}`, config: { id: `id-${address}`, address, type: "Folder", name }, body: "" };
}

function text(address: string, name: string, body = ""): CpItem {
  return { _id: `id-${address}`, config: { id: `id-${address}`, address, type: "Text", name }, body };
}

function makeOps(items: CpItem[]): DateReportsOps {
  return {
    resolveByNames: async (names) => {
      if (names.length === 1 && names[0] === "randki") {
        return items.find((i) => i.config.name === "randki" && i.config.type === "Folder") ?? null;
      }
      return null;
    },
    getChildrenOf: async (parentAddress) =>
      items
        .filter((item) => {
          const prefix = `${parentAddress}/`;
          if (!item.config.address.startsWith(prefix)) return false;
          return !item.config.address.slice(prefix.length).includes("/");
        })
        .sort((a, b) => a.config.address.localeCompare(b.config.address, undefined, { numeric: true })),
    getItemByAddress: async (address) => items.find((i) => i.config.address === address) ?? null,
  };
}

describe("listDateReports", () => {
  it("returns Text and Folder children newest-first (reversed provider order, no alpha sort)", async () => {
    const ops = makeOps([
      folder(REPO, "root"),
      folder(`${REPO}/06`, "randki"),
      text(`${REPO}/06/11`, "22-08-13; Sabina", "body a"),
      folder(`${REPO}/06/37`, "26-05-13_r1__Daria"),
      text(`${REPO}/06/02`, "co analizować?", "meta"),
    ]);
    const list = await listDateReports(ops);
    expect(list.map((r) => r.name)).toEqual([
      "26-05-13_r1__Daria",
      "22-08-13; Sabina",
      "co analizować?",
    ]);
    expect(list.map((r) => r.kind)).toEqual(["Folder", "Text", "Text"]);
  });

  it("returns [] when randki folder is missing", async () => {
    expect(await listDateReports(makeOps([folder(REPO, "root")]))).toEqual([]);
  });
});

describe("listDateReportChildren", () => {
  it("lists parts under a Folder in provider order", async () => {
    const ops = makeOps([
      folder(`${REPO}/06`, "randki"),
      folder(`${REPO}/06/37`, "26-05-13_r1__Daria"),
      text(`${REPO}/06/37/01`, "before", "prep"),
      text(`${REPO}/06/37/02`, "report", "date report body"),
      text(`${REPO}/06/37/03`, "after", "notes"),
    ]);
    const kids = await listDateReportChildren(`${REPO}/06/37`, ops);
    expect(kids.map((k) => k.name)).toEqual(["before", "report", "after"]);
  });

  it("rejects addresses that are not direct Folder children of randki", async () => {
    const ops = makeOps([
      folder(`${REPO}/06`, "randki"),
      folder(`${REPO}/06/37`, "Daria"),
      text(`${REPO}/06/37/01`, "report", "x"),
    ]);
    expect(await listDateReportChildren(`${REPO}/06/37/01`, ops)).toEqual([]);
    expect(await listDateReportChildren(`${OTHER}/06/37`, ops)).toEqual([]);
  });
});

describe("getDateReportTextByAddress", () => {
  it("loads Text body for a direct Text child", async () => {
    const ops = makeOps([
      folder(`${REPO}/06`, "randki"),
      text(`${REPO}/06/11`, "22-08-13; Sabina", "hello\nworld"),
    ]);
    const item = await getDateReportTextByAddress(`${REPO}/06/11`, ops);
    expect(item?.body).toBe("hello\nworld");
    expect(item?.editLoca).toBe("06/11");
    expect(item?.editable).toBe(true);
  });

  it("loads nested part Text under a Folder", async () => {
    const ops = makeOps([
      folder(`${REPO}/06`, "randki"),
      folder(`${REPO}/06/37`, "26-05-13_r1__Daria"),
      text(`${REPO}/06/37/01`, "before", "prep"),
      text(`${REPO}/06/37/02`, "report", "date report body"),
    ]);
    const item = await getDateReportTextByAddress(`${REPO}/06/37/02`, ops);
    expect(item?.name).toBe("report");
    expect(item?.body).toBe("date report body");
  });

  it("rejects addresses outside the caller's randki folder (isolation)", async () => {
    const ops = makeOps([
      folder(`${REPO}/06`, "randki"),
      text(`${REPO}/06/11`, "mine", "ok"),
      folder(`${OTHER}/06`, "randki"),
      text(`${OTHER}/06/11`, "theirs", "secret"),
    ]);
    expect(await getDateReportTextByAddress(`${OTHER}/06/11`, ops)).toBeNull();
    expect(await getDateReportTextByAddress(`${REPO}/07/02/01`, ops)).toBeNull();
  });
});
