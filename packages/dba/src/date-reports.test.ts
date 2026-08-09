import { describe, expect, it } from "vitest";
import {
  getDateReportByAddress,
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
      items.filter((item) => {
        const prefix = `${parentAddress}/`;
        if (!item.config.address.startsWith(prefix)) return false;
        return !item.config.address.slice(prefix.length).includes("/");
      }),
    getItemByAddress: async (address) => items.find((i) => i.config.address === address) ?? null,
  };
}

describe("listDateReports", () => {
  it("returns Text and Folder children in provider order (no alpha sort)", async () => {
    const ops = makeOps([
      folder(REPO, "root"),
      folder(`${REPO}/06`, "randki"),
      text(`${REPO}/06/11`, "22-08-13; Sabina", "body a"),
      folder(`${REPO}/06/37`, "26-05-13_r1__Daria"),
      text(`${REPO}/06/02`, "co analizować?", "meta"),
    ]);
    const list = await listDateReports(ops);
    expect(list.map((r) => r.name)).toEqual([
      "22-08-13; Sabina",
      "26-05-13_r1__Daria",
      "co analizować?",
    ]);
    expect(list.map((r) => r.kind)).toEqual(["Text", "Folder", "Text"]);
  });

  it("returns [] when randki folder is missing", async () => {
    expect(await listDateReports(makeOps([folder(REPO, "root")]))).toEqual([]);
  });
});

describe("getDateReportByAddress", () => {
  it("loads Text body for a direct Text child", async () => {
    const ops = makeOps([
      folder(`${REPO}/06`, "randki"),
      text(`${REPO}/06/11`, "22-08-13; Sabina", "hello\nworld"),
    ]);
    const item = await getDateReportByAddress(`${REPO}/06/11`, ops);
    expect(item?.body).toBe("hello\nworld");
    expect(item?.editLoca).toBe("06/11");
    expect(item?.editable).toBe(true);
  });

  it("loads nested report Text for a Folder child", async () => {
    const ops = makeOps([
      folder(`${REPO}/06`, "randki"),
      folder(`${REPO}/06/37`, "26-05-13_r1__Daria"),
      text(`${REPO}/06/37/01`, "before", "prep"),
      text(`${REPO}/06/37/02`, "report", "date report body"),
    ]);
    const item = await getDateReportByAddress(`${REPO}/06/37`, ops);
    expect(item?.name).toBe("26-05-13_r1__Daria");
    expect(item?.body).toBe("date report body");
    expect(item?.editAddress).toBe(`${REPO}/06/37/02`);
    expect(item?.editable).toBe(true);
  });

  it("rejects addresses outside the caller's randki folder (isolation)", async () => {
    const ops = makeOps([
      folder(`${REPO}/06`, "randki"),
      text(`${REPO}/06/11`, "mine", "ok"),
      folder(`${OTHER}/06`, "randki"),
      text(`${OTHER}/06/11`, "theirs", "secret"),
    ]);
    expect(await getDateReportByAddress(`${OTHER}/06/11`, ops)).toBeNull();
    expect(await getDateReportByAddress(`${REPO}/07/02/01`, ops)).toBeNull();
  });
});
