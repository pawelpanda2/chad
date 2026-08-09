// @vitest-environment jsdom
/**
 * Story 113 — Dates Reports system-page: list from /api/views/dates-reports,
 * open item body, empty vs error.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DatesReportsView } from "./dates-reports-view.js";

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
  }) => (
    <div>
      <h1>{props.title}</h1>
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

describe("DatesReportsView", () => {
  it("lists date reports and opens body from dates-reports item API", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo) => {
      const url = String(input);
      if (url === "/api/views/dates-reports") {
        return {
          ok: true,
          json: async () => ({
            success: true,
            reports: [
              {
                name: "26-05-13_r1__pn_Daria",
                loca: "06/37",
                address: "repo/06/37",
                kind: "Folder",
              },
            ],
          }),
        };
      }
      if (url.includes("/api/views/dates-reports/item")) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: {
              body: "daria report body",
              editLoca: "06/37/01",
              editable: true,
            },
          }),
        };
      }
      throw new Error(`unexpected fetch ${url}`);
    });

    const onSelect = vi.fn();
    const { rerender } = render(
      <DatesReportsView selectedReportLoca={null} onSelectReport={onSelect} onBackToMenu={vi.fn()} />,
    );

    await waitFor(() => {
      expect(screen.getByText("Dates Reports")).toBeTruthy();
      expect(screen.getByText("26-05-13_r1__pn_Daria")).toBeTruthy();
    });

    await userEvent.click(screen.getByRole("button", { name: "26-05-13_r1__pn_Daria" }));
    expect(onSelect).toHaveBeenCalledWith("06/37");

    rerender(
      <DatesReportsView
        selectedReportLoca="06/37"
        onSelectReport={onSelect}
        onBackToMenu={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("body").textContent).toBe("daria report body");
    });
  });

  it("shows empty copy for dates when folder has no reports", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, reports: [] }),
    });

    render(
      <DatesReportsView selectedReportLoca={null} onSelectReport={vi.fn()} onBackToMenu={vi.fn()} />,
    );

    await waitFor(() => {
      expect(screen.getByText("No date reports found (dates / randki).")).toBeTruthy();
    });
  });

  it("surfaces fetch errors separately from empty", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ success: false, error: "randki unavailable" }),
    });

    render(
      <DatesReportsView selectedReportLoca={null} onSelectReport={vi.fn()} onBackToMenu={vi.fn()} />,
    );

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe("randki unavailable");
    });
    expect(screen.queryByText(/No date reports found/)).toBeNull();
  });
});
