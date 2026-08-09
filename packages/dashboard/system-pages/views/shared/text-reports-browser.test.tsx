// @vitest-environment jsdom
/**
 * Story 113 — shared Reports / Dates Reports shell: loading, empty, error,
 * list selection, and editor open. Mocks the heavy editor.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TextReportsBrowser } from "./text-reports-browser.js";

vi.mock("@/components/shared/text-editor-with-toolbar", () => ({
  TextEditorWithToolbar: ({
    value,
    showSave,
  }: {
    value: string;
    showSave?: boolean;
  }) => (
    <div data-testid="editor">
      <span data-testid="editor-body">{value}</span>
      {showSave !== false ? <button type="button">Save</button> : null}
    </div>
  ),
}));

vi.mock("@/components/shared/dashboard-page-shell", () => ({
  DashboardPageShell: ({
    title,
    children,
    upLevel,
  }: {
    title: string;
    children: React.ReactNode;
    upLevel?: { onClick: () => void; label?: string };
  }) => (
    <div>
      <h1>{title}</h1>
      {upLevel ? (
        <button type="button" onClick={upLevel.onClick}>
          {upLevel.label ?? "Up"}
        </button>
      ) : null}
      {children}
    </div>
  ),
}));

vi.mock("@/components/shared/error-box", () => ({
  ErrorBox: ({ message }: { message: string | null }) =>
    message ? <div role="alert">{message}</div> : null,
}));

const baseProps = {
  title: "Reports",
  selectedReport: null as null | { key: string; name: string; loca: string },
  onBackToList: vi.fn(),
  onBackToMenu: vi.fn(),
  filter: "",
  onFilterChange: vi.fn(),
  filterPlaceholder: "Search reports",
  onRefresh: vi.fn(),
  loading: false,
  error: null as string | null,
  countLabel: "1 of 1 reports",
  emptyMessage: "No reports in this category.",
  rows: [{ key: "07/04/01", name: "26-07-14_dg", loca: "07/04/01" }],
  onSelectReport: vi.fn(),
  editorValue: "",
  onEditorChange: vi.fn(),
  onSave: vi.fn(async () => true),
  saving: false,
  saved: false,
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("TextReportsBrowser", () => {
  it("shows loading state", () => {
    render(<TextReportsBrowser {...baseProps} loading rows={[]} countLabel="0 of 0 reports" />);
    expect(screen.getByText("Loading reports...")).toBeTruthy();
  });

  it("shows empty message when not loading and no error", () => {
    render(
      <TextReportsBrowser
        {...baseProps}
        rows={[]}
        countLabel="0 of 0 reports"
        emptyMessage="No date reports found (dates / randki)."
      />,
    );
    expect(screen.getByText("No date reports found (dates / randki).")).toBeTruthy();
  });

  it("shows error without pretending the list is empty", () => {
    render(
      <TextReportsBrowser
        {...baseProps}
        error="boom"
        rows={[]}
        countLabel="0 of 0 reports"
      />,
    );
    expect(screen.getByRole("alert").textContent).toBe("boom");
    expect(screen.queryByText("No reports in this category.")).toBeNull();
  });

  it("selects a report from the list", () => {
    const onSelectReport = vi.fn();
    render(<TextReportsBrowser {...baseProps} onSelectReport={onSelectReport} />);
    fireEvent.click(screen.getByRole("button", { name: "26-07-14_dg" }));
    expect(onSelectReport).toHaveBeenCalledWith("07/04/01");
  });

  it("opens editor when a report is selected", () => {
    render(
      <TextReportsBrowser
        {...baseProps}
        selectedReport={{ key: "07/04/01", name: "26-07-14_dg", loca: "07/04/01" }}
        editorValue="report body"
      />,
    );
    expect(screen.getByTestId("editor-body").textContent).toBe("report body");
    expect(screen.queryByText("26-07-14_dg")).toBeNull();
  });
});
