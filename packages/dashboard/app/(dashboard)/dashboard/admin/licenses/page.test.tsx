// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { cleanup, render, screen, waitFor, fireEvent } from "@testing-library/react";
import AdminLicensesPage from "./page.js";

vi.mock("@/components/shared/dashboard-page-shell", () => ({
  DashboardPageShell: ({ children, title }: { children: React.ReactNode; title: string }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));

const sampleLicense = {
  id: "lic-1",
  company: "Example LLC",
  username: "test2",
  repoGuid: "repo-1",
  userCount: 1,
  licensePeriod: "1 month",
  amountMinor: 80000,
  currency: "PLN",
  status: "paid",
  purchasedAt: "2026-08-17T10:06:00.000Z",
  agreementVersion: "1.0-DRAFT",
  acceptedAt: "2026-08-17T10:05:00.000Z",
};

const sampleDetail = {
  ...sampleLicense,
  verifiedEmail: "buyer@example.com",
  emailVerifiedAt: "2026-08-17T10:00:00.000Z",
  paymentMethod: "stripe",
  paymentKind: "user_payment",
  stripeMode: "live",
  paymentStatus: "completed",
  checkoutSessionId: "cs_test",
  paymentIntentId: "pi_test",
  agreementTextHash: "abc",
  agreementRecordLogicalHash: "def",
  acceptedBy: "test2",
  businessSnapshot: { legalBusinessName: "Example LLC" },
  generatedAt: "2026-08-17T10:05:00.000Z",
  agreementPdfHash: "pdfhash",
  licenseActivatedAt: null,
  planId: "chad-dashboard-1u",
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Admin → Licenses", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo) => {
        const url = String(input);
        if (url.endsWith("/api/admin/licenses")) {
          return { ok: true, json: async () => ({ success: true, licenses: [sampleLicense] }) };
        }
        if (url.includes("/api/admin/licenses/lic-1")) {
          return { ok: true, json: async () => ({ success: true, license: sampleDetail }) };
        }
        return { ok: false, json: async () => ({ success: false }) };
      }),
    );
  });

  it("loads list and shows detail panel with PDF link", async () => {
    render(<AdminLicensesPage />);
    await waitFor(() => expect(screen.getByText("Example LLC")).toBeTruthy());
    expect(screen.getByText("Admin — Licenses")).toBeTruthy();
    await waitFor(() => expect(screen.getByText("License details")).toBeTruthy());
    const pdfLink = screen.getByRole("link", { name: "View agreement PDF" });
    expect(pdfLink.getAttribute("href")).toBe("/api/admin/licenses/lic-1/pdf");
  });

  it("updates detail when another row is selected", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo) => {
        const url = String(input);
        if (url.endsWith("/api/admin/licenses")) {
          return {
            ok: true,
            json: async () => ({
              success: true,
              licenses: [
                sampleLicense,
                { ...sampleLicense, id: "lic-2", company: "Other LLC" },
              ],
            }),
          };
        }
        if (url.includes("/api/admin/licenses/lic-2")) {
          return {
            ok: true,
            json: async () => ({
              success: true,
              license: { ...sampleDetail, id: "lic-2", company: "Other LLC" },
            }),
          };
        }
        if (url.includes("/api/admin/licenses/lic-1")) {
          return { ok: true, json: async () => ({ success: true, license: sampleDetail }) };
        }
        return { ok: false, json: async () => ({}) };
      }),
    );
    render(<AdminLicensesPage />);
    await waitFor(() => expect(screen.getAllByText("Example LLC").length).toBeGreaterThan(0));
    fireEvent.click(screen.getByText("Other LLC"));
    await waitFor(() => expect(screen.getAllByText("Other LLC").length).toBeGreaterThan(0));
  });
});
