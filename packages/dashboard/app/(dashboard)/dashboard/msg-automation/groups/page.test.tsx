// @vitest-environment jsdom
/**
 * Standalone Groups page — a direct Msg Automation entry point for the same
 * `BeeperGroupsView` MultiView's own Groups tab already uses. This page owns
 * the toolbar (List|Manage sub-tabs, Search, item count); `BeeperGroupsView`
 * itself never renders a search input. `BeeperGroupsView` is mocked here so
 * the test targets only what this page itself is responsible for wiring.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DashboardHistoryProvider } from "@/components/shared/dashboard-history-provider";
import GroupsPageImpl from "./page.js";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/msg-automation/groups",
  useRouter: () => ({ back: vi.fn(), forward: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

function GroupsPage() {
  return (
    <DashboardHistoryProvider>
      <GroupsPageImpl />
    </DashboardHistoryProvider>
  );
}

vi.mock("@/components/beeper/beeper-groups-view", () => ({
  BeeperGroupsView: (props: {
    subTab?: string;
    query?: string;
    onQueryChange?: (q: string) => void;
    onCountChange?: (n: number) => void;
  }) => (
    <div data-testid="beeper-groups-view" data-sub-tab={props.subTab} data-query={props.query}>
      <button type="button" onClick={() => props.onCountChange?.(7)}>
        report-count
      </button>
    </div>
  ),
}));

afterEach(() => {
  cleanup();
});

describe("Msg Automation -> Groups (standalone page)", () => {
  it("renders List sub-tab by default, passing subTab down to BeeperGroupsView", () => {
    render(<GroupsPage />);
    const view = screen.getByTestId("beeper-groups-view");
    expect(view.getAttribute("data-sub-tab")).toBe("list");
  });

  it("switching to Manage updates the sub-tab passed to BeeperGroupsView and hides the item count", () => {
    render(<GroupsPage />);
    // Radix's Tabs.Trigger selects on `mousedown`, not `click`.
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Manage" }));

    const view = screen.getByTestId("beeper-groups-view");
    expect(view.getAttribute("data-sub-tab")).toBe("manage");
    expect(screen.queryByText(/items$/)).toBeNull();
  });

  it("typing in Search updates the query passed down to BeeperGroupsView", () => {
    render(<GroupsPage />);
    const search = screen.getByLabelText("Search");
    fireEvent.change(search, { target: { value: "vip" } });

    const view = screen.getByTestId("beeper-groups-view");
    expect(view.getAttribute("data-query")).toBe("vip");
  });

  it("shows the item count reported by BeeperGroupsView while on the List sub-tab", () => {
    render(<GroupsPage />);
    fireEvent.click(screen.getByText("report-count"));
    expect(screen.getByText("7 items")).toBeTruthy();
  });
});
