// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import AdminPaymentsPage from "./page.js";

vi.mock("@/components/shared/dashboard-page-shell", () => ({
  DashboardPageShell: ({ children, title }: { children: React.ReactNode; title: string }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Admin → Payments", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo) => {
        const url = String(input);
        if (url.includes("/api/admin/users")) {
          return {
            ok: true,
            json: async () => [{ id: "repo-admin", username: "admin" }],
          };
        }
        if (url.includes("/api/admin/payments")) {
          return {
            ok: true,
            json: async () => ({
              success: true,
              payments: [],
              plans: [
                {
                  id: "chad-dashboard-1u",
                  userCount: 1,
                  amountMinor: 80000,
                  currency: "PLN",
                  licensePeriod: "12 months",
                },
              ],
              currentUser: { repoGuid: "repo-admin", username: "admin" },
            }),
          };
        }
        return { ok: false, json: async () => ({}) };
      }),
    );
  });

  it("has History and Test tabs", async () => {
    render(<AdminPaymentsPage />);
    await waitFor(() => expect(screen.getByRole("tab", { name: "History" })).toBeTruthy());
    expect(screen.getByRole("tab", { name: "Test" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "History" }).getAttribute("data-state")).toBe("active");
  });
});
