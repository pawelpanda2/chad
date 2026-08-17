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
  plans: [
    {
      id: "chad-dashboard-2u",
      productName: "CHAD Dashboard",
      productVersion: "1",
      userCount: 2,
      amountMinor: 160000,
      currency: "PLN",
      licensePeriod: "12 months",
      territory: "Poland",
    },
  ],
  profile: null,
  agreement: {
    version: "1.0-DRAFT",
    title: "CHAD Dashboard License Agreement (draft — requires approved legal text)",
    body: "PLACEHOLDER",
    draft: true,
  },
  payments: [],
  testPayments: [],
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
    await waitFor(() => expect(screen.getByText("Payment")).toBeTruthy());
    expect(screen.queryByPlaceholderText("500.00")).toBeNull();
    expect(screen.queryByRole("button", { name: /pay with card/i })).toBeNull();
    expect(screen.getByRole("button", { name: /accept license & continue to payment/i })).toBeTruthy();
    expect(screen.getByText("Stripe")).toBeTruthy();
  });

  it("hides Test payments when the user has none", async () => {
    render(<PaymentsSettingsPage />);
    await waitFor(() => expect(screen.getByText("Payment history")).toBeTruthy());
    expect(screen.queryByText("Test payments")).toBeNull();
  });
});
