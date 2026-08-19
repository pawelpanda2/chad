import { describe, expect, it } from "vitest";
import { formatNavigationHistorySnapshot } from "./format-navigation-history.js";

describe("formatNavigationHistorySnapshot", () => {
  it("matches the documented Copy format, with the current entry marked", () => {
    const text = formatNavigationHistorySnapshot({
      entries: [
        "/dashboard",
        "/dashboard/msg-automation",
        "/dashboard/msg-automation/multiview",
        "/dashboard/msg-automation/multiview?contact=A",
        "/dashboard/msg-automation/multiview?contact=B",
      ],
      index: 3,
    });
    expect(text).toBe(
      [
        "navigation-history",
        "currentIndex: 3",
        "count: 5",
        "",
        "0 | /dashboard",
        "1 | /dashboard/msg-automation",
        "2 | /dashboard/msg-automation/multiview",
        "3 | CURRENT | /dashboard/msg-automation/multiview?contact=A",
        "4 | /dashboard/msg-automation/multiview?contact=B",
      ].join("\n"),
    );
  });

  it("handles a single-entry stack (e.g. right after Clear)", () => {
    const text = formatNavigationHistorySnapshot({ entries: ["/dashboard/forms"], index: 0 });
    expect(text).toBe(["navigation-history", "currentIndex: 0", "count: 1", "", "0 | CURRENT | /dashboard/forms"].join("\n"));
  });
});
