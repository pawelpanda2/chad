// @vitest-environment jsdom
/**
 * Story 113 — Dates Reports: Text opens editor; Folder shows parts on the right.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DatesReportsView } from "./dates-reports-view.js";

vi.mock("@/components/shared/text-editor-with-toolbar", () => ({
  TextEditorWithToolbar: ({ value }: { value: string }) => (
    <div data-testid="editor-body">{value}</div>
  ),
}));

vi.mock("@/components/shared/dashboard-page-shell", () => ({
  DashboardPageShell: ({
    title,
    children,
  }: {
    title: string;
    children: React.ReactNode;
  }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));

vi.mock("@/components/shared/error-box", () => ({
  ErrorBox: ({ message }: { message: string | null }) =>
    message ? <div role="alert">{message}</div> : null,
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));

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
  it("opens Text report in the editor", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo) => {
      const url = String(input);
      if (url === "/api/views/dates-reports") {
        return {
          ok: true,
          json: async () => ({
            success: true,
            reports: [
              {
                name: "22-08-13; Sabina",
                loca: "06/11",
                address: "repo/06/11",
                kind: "Text",
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
            data: { body: "sabina body", editLoca: "06/11", editable: true },
          }),
        };
      }
      throw new Error(`unexpected fetch ${url}`);
    });

    const onSelect = vi.fn();
    const { rerender } = render(
      <DatesReportsView
        selectedReportLoca={null}
        selectedPartLoca={null}
        onSelectReport={onSelect}
        onSelectPart={vi.fn()}
        onBackToMenu={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("22-08-13; Sabina")).toBeTruthy();
    });

    await userEvent.click(screen.getByRole("button", { name: "22-08-13; Sabina" }));
    expect(onSelect).toHaveBeenCalledWith("06/11");

    rerender(
      <DatesReportsView
        selectedReportLoca="06/11"
        selectedPartLoca={null}
        onSelectReport={onSelect}
        onSelectPart={vi.fn()}
        onBackToMenu={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("editor-body").textContent).toBe("sabina body");
      expect(screen.getByRole("heading", { name: "22-08-13; Sabina" })).toBeTruthy();
    });
  });

  it("shows Folder parts on the right, then opens a part in the editor", async () => {
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
      if (url.includes("/api/views/dates-reports/children")) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            children: [
              { name: "before", loca: "06/37/01", address: "repo/06/37/01", kind: "Text" },
              { name: "report", loca: "06/37/02", address: "repo/06/37/02", kind: "Text" },
            ],
          }),
        };
      }
      if (url.includes("/api/views/dates-reports/item")) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: { body: "daria report body", editLoca: "06/37/02", editable: true },
          }),
        };
      }
      throw new Error(`unexpected fetch ${url}`);
    });

    const onSelect = vi.fn();
    const onSelectPart = vi.fn();
    const { rerender } = render(
      <DatesReportsView
        selectedReportLoca={null}
        selectedPartLoca={null}
        onSelectReport={onSelect}
        onSelectPart={onSelectPart}
        onBackToMenu={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("26-05-13_r1__pn_Daria")).toBeTruthy();
    });

    await userEvent.click(screen.getByRole("button", { name: "26-05-13_r1__pn_Daria" }));
    expect(onSelect).toHaveBeenCalledWith("06/37");

    rerender(
      <DatesReportsView
        selectedReportLoca="06/37"
        selectedPartLoca={null}
        onSelectReport={onSelect}
        onSelectPart={onSelectPart}
        onBackToMenu={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/Parts —/)).toBeTruthy();
      expect(screen.getByText("before")).toBeTruthy();
      expect(screen.getByText("report")).toBeTruthy();
    });
    expect(screen.queryByTestId("editor-body")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "report" }));
    expect(onSelectPart).toHaveBeenCalledWith("06/37/02");

    rerender(
      <DatesReportsView
        selectedReportLoca="06/37"
        selectedPartLoca="06/37/02"
        onSelectReport={onSelect}
        onSelectPart={onSelectPart}
        onBackToMenu={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("editor-body").textContent).toBe("daria report body");
      expect(screen.getByRole("heading", { name: "report" })).toBeTruthy();
    });
  });

  it("surfaces fetch errors separately from empty", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ success: false, error: "randki unavailable" }),
    });

    render(
      <DatesReportsView
        selectedReportLoca={null}
        selectedPartLoca={null}
        onSelectReport={vi.fn()}
        onSelectPart={vi.fn()}
        onBackToMenu={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe("randki unavailable");
    });
    expect(screen.queryByText(/No date reports found/)).toBeNull();
  });
});
