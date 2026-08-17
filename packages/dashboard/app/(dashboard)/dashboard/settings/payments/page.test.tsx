// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import PaymentsSettingsPage from "./page.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const commerce = {
  success: true,
  userCount: 2,
  unitPriceMinor: 79000,
  userCountMin: 1,
  userCountMax: 99,
  planId: "chad-dashboard-2u",
  selectedPlan: {
    id: "chad-dashboard-2u",
    productName: "CHAD Dashboard",
    productVersion: "1",
    userCount: 2,
    amountMinor: 158000,
    currency: "PLN",
    licensePeriod: "1 month",
    territory: "Poland",
  },
  profile: null,
  agreement: {
    version: "1.0-DRAFT",
    title: "CHAD Dashboard License Agreement (draft — requires approved legal text)",
    body: "PLACEHOLDER",
    draft: true,
  },
  payments: [],
  testPayments: [],
  businessComplete: false,
  liveConfigured: false,
  verification: null,
};

describe("Settings → Payments", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo) => {
        const url = String(input);
        if (url.includes("/api/settings/payments/commerce")) {
          return { ok: true, json: async () => commerce };
        }
        return { ok: false, json: async () => ({ success: false }) };
      }),
    );
  });

  it("does not offer a free-amount fake payment field", async () => {
    render(<PaymentsSettingsPage />);
    await waitFor(() => expect(screen.getByText("Payment history")).toBeTruthy());
    expect(screen.queryByPlaceholderText("500.00")).toBeNull();
    expect(screen.queryByRole("button", { name: /pay with card/i })).toBeNull();
    expect(screen.getByRole("button", { name: /^pay$/i })).toBeTruthy();
    expect(screen.getByText("Stripe")).toBeTruthy();
    expect(screen.getByLabelText("Users")).toBeTruthy();
  });

  it("shows empty payment history without LIVE wording", async () => {
    render(<PaymentsSettingsPage />);
    await waitFor(() => expect(screen.getByText("No payments yet.")).toBeTruthy());
  });

  it("hides Test payments when the user has none", async () => {
    render(<PaymentsSettingsPage />);
    await waitFor(() => expect(screen.getByText("Payment history")).toBeTruthy());
    expect(screen.queryByText("Test payments")).toBeNull();
  });
});
