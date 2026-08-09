// @vitest-environment jsdom
/**
 * Story 113 — Reports system-page: categories → list → open body (no regression
 * after move out of views/page.tsx).
 */
import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReportsView } from "./reports-view.js";

vi.mock("@/system-pages/views/shared/text-reports-browser", () => ({
  TextReportsBrowser: (props: {
    title: string;
    loading: boolean;
    error: string | null;
    emptyMessage: string;
    rows: { name: string; loca: string }[];
    selectedReport: { name: string; loca: string } | null;
    editorValue: string;
    onSelectReport: (loca: string) => void;
    toolbarExtra?: React.ReactNode;
  }) => (
    <div>
      <h1>{props.title}</h1>
      {props.toolbarExtra}
      {props.loading ? <div>Loading reports...</div> : null}
      {props.error ? <div role="alert">{props.error}</div> : null}
      {!props.loading && !props.error && props.rows.length === 0 ? (
        <div>{props.emptyMessage}</div>
      ) : null}
      <ul>
        {props.rows.map((r) => (
          <li key={r.loca}>
            <button type="button" onClick={() => props.onSelectReport(r.loca)}>
              {r.name}
            </button>
          </li>
        ))}
      </ul>
      {props.selectedReport ? <div data-testid="body">{props.editorValue}</div> : null}
    </div>
  ),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ReportsView", () => {
  it("loads categories and reports, then opens a report body", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo) => {
      const url = String(input);
      if (url.includes("/api/reports/categories")) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            categories: [
              {
                id: "repo/02/06",
                logicalName: "daygame; full report",
                displayName: "daygame; full report",
                loca: "02/06",
              },
            ],
          }),
        };
      }
      if (url.startsWith("/api/reports?") || url.includes("/api/reports?category=")) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            reports: [{ name: "25-10-03; Złote tarasy", loca: "02/06/21", address: "repo/02/06/21" }],
          }),
        };
      }
      if (url.includes("/api/reports/item")) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: { body: "full report text", name: "25-10-03; Złote tarasy" },
          }),
        };
      }
      throw new Error(`unexpected fetch ${url}`);
    });

    const onSelect = vi.fn();
    const { rerender } = render(
      <ReportsView selectedReportLoca={null} onSelectReport={onSelect} onBackToMenu={vi.fn()} />,
    );

    await waitFor(() => {
      expect(screen.getByText("25-10-03; Złote tarasy")).toBeTruthy();
    });

    await userEvent.click(screen.getByRole("button", { name: "25-10-03; Złote tarasy" }));
    expect(onSelect).toHaveBeenCalledWith("02/06/21");

    rerender(
      <ReportsView selectedReportLoca="02/06/21" onSelectReport={onSelect} onBackToMenu={vi.fn()} />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("body").textContent).toBe("full report text");
    });
  });

  it("surfaces load errors distinctly from empty", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ success: false, error: "categories down" }),
    });

    render(<ReportsView selectedReportLoca={null} onSelectReport={vi.fn()} onBackToMenu={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe("categories down");
    });
  });
});
