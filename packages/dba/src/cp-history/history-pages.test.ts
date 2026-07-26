/**
 * Pure unit tests for History page-column matching (no DB).
 * Run: node --test packages/dba/dist/history-pages.test.js  (after build)
 *   or: vitest run packages/dba/src/history-pages.test.ts
 */

import { describe, expect, it } from "vitest";
import { matchHistoryPageName } from "../history-pages.js";

const REPO = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

describe("matchHistoryPageName", () => {
  const pages = [
    { name: "leads", address: `${REPO}/03` },
    { name: "msg-auto", address: `${REPO}/09` },
    { name: "dates", address: `${REPO}/07/02` },
    { name: "daily", address: `${REPO}/07/06` },
  ];

  it("returns null when no page matches", () => {
    expect(matchHistoryPageName(`${REPO}/99/01`, pages)).toBeNull();
    expect(matchHistoryPageName("", pages)).toBeNull();
    expect(matchHistoryPageName(`${REPO}/07/02`, [])).toBeNull();
  });

  it("matches the page folder itself", () => {
    expect(matchHistoryPageName(`${REPO}/07/02`, pages)).toBe("dates");
  });

  it("matches descendants under the page's current loca (e.g. dates/07/02 children)", () => {
    // User example: dates page owns children further down its path.
    expect(matchHistoryPageName(`${REPO}/07/02/07/02`, pages)).toBe("dates");
    expect(matchHistoryPageName(`${REPO}/07/02/01`, pages)).toBe("dates");
  });

  it("picks the longest prefix when multiple pages could match", () => {
    // If views were also listed at /07, dates at /07/02 must win.
    const withViews = [...pages, { name: "views", address: `${REPO}/07` }];
    expect(matchHistoryPageName(`${REPO}/07/02/03`, withViews)).toBe("dates");
    expect(matchHistoryPageName(`${REPO}/07/06/01`, withViews)).toBe("daily");
  });

  it("still works after the page loca moves (match by current address, not hardcoded segments)", () => {
    // dates relocated from 07/02 → 05/01 — same id/name, new address.
    const moved = [{ name: "dates", address: `${REPO}/05/01` }];
    expect(matchHistoryPageName(`${REPO}/05/01/07/02`, moved)).toBe("dates");
    expect(matchHistoryPageName(`${REPO}/07/02/01`, moved)).toBeNull();
  });
});
