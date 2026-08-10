// @vitest-environment jsdom
/**
 * Story 116 — Settings nav cleanup: Notifications and API must be gone,
 * Payments must exist, and the old global Theme card (rendered above every
 * Settings subpage) must be gone (Theme now lives only inside Display).
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import SettingsLayout from "./layout.js";
import { DashboardHistoryProvider } from "@/components/shared/dashboard-history-provider";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/settings",
  useRouter: () => ({ back: vi.fn(), forward: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(cleanup);

function renderLayout() {
  return render(
    <DashboardHistoryProvider>
      <SettingsLayout>{null}</SettingsLayout>
    </DashboardHistoryProvider>,
  );
}

describe("Settings layout — navigation", () => {
  it("does not render Notifications or API tabs", () => {
    renderLayout();
    expect(screen.queryByRole("link", { name: "Notifications" })).toBeNull();
    expect(screen.queryByRole("link", { name: "API" })).toBeNull();
  });

  it("renders a Payments tab", () => {
    renderLayout();
    const link = screen.getByRole("link", { name: "Payments" });
    expect(link.getAttribute("href")).toBe("/dashboard/settings/payments");
  });

  it("keeps the untouched, working tabs (Profile, Account, Password, Appearance, Display, Folders)", () => {
    renderLayout();
    for (const name of ["Profile", "Account", "Password", "Appearance", "Display", "Folders"]) {
      expect(screen.getByRole("link", { name })).toBeTruthy();
    }
  });

  it("does not render a global Theme selector above the Settings subpages", () => {
    renderLayout();
    expect(screen.queryByText("Theme")).toBeNull();
  });
});
