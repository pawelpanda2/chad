// @vitest-environment jsdom
/**
 * Story 116 continuation — Settings nav: Account (was Profile), Payments
 * second, Users present, old Account duplicate gone; tabs inside the outer
 * shell frame above the inner content frame (Daily Tracker pattern).
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
  it("does not render Notifications, API, Profile, or the old Account path", () => {
    renderLayout();
    expect(screen.queryByRole("link", { name: "Notifications" })).toBeNull();
    expect(screen.queryByRole("link", { name: "API" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Profile" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Account" })?.getAttribute("href")).toBe(
      "/dashboard/settings",
    );
    expect(screen.queryByRole("link", { name: "Account" })?.getAttribute("href")).not.toBe(
      "/dashboard/settings/account",
    );
  });

  it("orders Account then Payments as the first two tabs", () => {
    renderLayout();
    const links = screen.getAllByRole("link").map((a) => a.textContent);
    const accountIdx = links.indexOf("Account");
    const paymentsIdx = links.indexOf("Payments");
    expect(accountIdx).toBeGreaterThanOrEqual(0);
    expect(paymentsIdx).toBe(accountIdx + 1);
  });

  it("renders Users and Payments tabs", () => {
    renderLayout();
    expect(screen.getByRole("link", { name: "Payments" }).getAttribute("href")).toBe(
      "/dashboard/settings/payments",
    );
    expect(screen.getByRole("link", { name: "Users" }).getAttribute("href")).toBe(
      "/dashboard/settings/users",
    );
  });

  it("keeps Password, Appearance, Folders (Display removed)", () => {
    renderLayout();
    for (const name of ["Password", "Appearance", "Folders"]) {
      expect(screen.getByRole("link", { name })).toBeTruthy();
    }
    expect(screen.queryByRole("link", { name: "Display" })).toBeNull();
  });

  it("does not render a global Theme selector above the Settings subpages", () => {
    renderLayout();
    expect(screen.queryByText("Theme")).toBeNull();
  });
});
