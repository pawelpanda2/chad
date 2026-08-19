import { describe, expect, it } from "vitest";
import { getHierarchyParent } from "./dashboard-hierarchy.js";

function parent(pathname: string, query: Record<string, string> = {}) {
  const result = getHierarchyParent(pathname, new URLSearchParams(query));
  return result?.href ?? null;
}

describe("Dashboards root", () => {
  it("has no parent", () => {
    expect(getHierarchyParent("/dashboard", new URLSearchParams())).toBeNull();
  });
});

describe("hub roots", () => {
  it.each([
    "/dashboard/forms",
    "/dashboard/views",
    "/dashboard/knowledge",
    "/dashboard/msg-automation",
    "/dashboard/admin",
    "/dashboard/folders",
    "/dashboard/settings",
    "/dashboard/history",
  ])("%s -> Dashboards", (pathname) => {
    expect(parent(pathname)).toBe("/dashboard");
  });

  it("Beeper's own root points at Msg Automation, not Dashboards", () => {
    expect(parent("/dashboard/beeper")).toBe("/dashboard/msg-automation");
  });
});

describe("Forms detail states", () => {
  it("plain menu (no form param) -> Dashboards", () => {
    expect(parent("/dashboard/forms")).toBe("/dashboard");
  });
  it("add_recording honors returnTo", () => {
    expect(parent("/dashboard/forms", { form: "add_recording", returnTo: "/dashboard/views?view=recordings" })).toBe(
      "/dashboard/views?view=recordings",
    );
  });
  it("add_recording default when no returnTo", () => {
    expect(parent("/dashboard/forms", { form: "add_recording" })).toBe("/dashboard/views?view=recordings");
  });
  it("action strips back to the Forms menu", () => {
    expect(parent("/dashboard/forms", { form: "action" })).toBe("/dashboard/forms");
  });
  it("add_action editing an existing entry goes to the tracker", () => {
    expect(parent("/dashboard/forms", { form: "add_action", editLoca: "1/2" })).toBe("/dashboard/views?view=tracker");
  });
  it("add_action creating a new entry goes to the Forms menu", () => {
    expect(parent("/dashboard/forms", { form: "add_action" })).toBe("/dashboard/forms");
  });
});

describe("Views detail states", () => {
  it("plain menu (no view param) -> Dashboards", () => {
    expect(parent("/dashboard/views")).toBe("/dashboard");
  });
  it("leads strips back to the Views menu", () => {
    expect(parent("/dashboard/views", { view: "leads" })).toBe("/dashboard/views");
  });
  it("recordings with a selected recording clears just the recording param", () => {
    expect(parent("/dashboard/views", { view: "recordings", recording: "42" })).toBe(
      "/dashboard/views?view=recordings",
    );
  });
  it("recordings with none selected goes to the menu", () => {
    expect(parent("/dashboard/views", { view: "recordings" })).toBe("/dashboard/views");
  });
  it("dates-reports strips part first, then report, then goes to the menu", () => {
    expect(parent("/dashboard/views", { view: "dates-reports", report: "r1", part: "p1" })).toBe(
      "/dashboard/views?view=dates-reports&report=r1",
    );
    expect(parent("/dashboard/views", { view: "dates-reports", report: "r1" })).toBe(
      "/dashboard/views?view=dates-reports",
    );
    expect(parent("/dashboard/views", { view: "dates-reports" })).toBe("/dashboard/views");
  });
});

describe("dynamic-segment prefix rules", () => {
  it("ai-prompts/[promptId] falls back to the ai-prompts list", () => {
    expect(parent("/dashboard/msg-automation/ai-prompts/abc-123")).toBe("/dashboard/msg-automation/ai-prompts");
  });
  it("ai-prompts/new is more specific than the promptId prefix rule", () => {
    expect(parent("/dashboard/msg-automation/ai-prompts/new")).toBe("/dashboard/msg-automation/ai-prompts");
  });
  it("beeper/[id] falls back to the Beeper list", () => {
    expect(parent("/dashboard/beeper/abc-123")).toBe("/dashboard/beeper");
  });
  it("admin/examples/[x] falls back to Examples, not Admin directly", () => {
    expect(parent("/dashboard/admin/examples/knowledge-v1")).toBe("/dashboard/admin/examples");
  });
  it("history/entry/[id] has no URL-derivable target, falls back to the History hub", () => {
    expect(parent("/dashboard/history/entry/42")).toBe("/dashboard/history");
  });
});

describe("unmodeled routes fall back to Dashboards, never stay stuck disabled", () => {
  it("an unknown pathname still resolves to a working parent", () => {
    expect(parent("/dashboard/some-future-page")).toBe("/dashboard");
  });
});
