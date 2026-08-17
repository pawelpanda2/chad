import { describe, it, expect } from "vitest";
import type { LicenseAcceptanceSnapshot } from "./license-commerce.js";
import {
  agreementPdfHash,
  agreementRecordLogicalHash,
  buildLicenseAgreementPdf,
  buildLicensePurchaseRecordCanonicalText,
  type LicensePurchaseRecordContext,
} from "./license-agreement-pdf.js";

const sampleSnapshot: LicenseAcceptanceSnapshot = {
  agreementVersion: "1.0-DRAFT",
  agreementSha256: "abc123def456",
  agreementTitle: "CHAD DASHBOARD LICENSE AGREEMENT 1.0-DRAFT",
  agreementBody: "Sample agreement body for PDF test.\n\nLicense Term\nEach purchased license is valid for 1 month.",
  productName: "CHAD Dashboard",
  productVersion: "1",
  planId: "chad-dashboard-1u",
  userCount: 1,
  licensePeriod: "1 month",
  licensePeriodMonths: 1,
  territory: "Poland",
  amountMinor: 80000,
  currency: "PLN",
  paymentMethod: "stripe",
  legalBusinessName: "Example Sp. z o.o.",
  country: "Poland",
  state: null,
  filingId: "1234567890",
  businessAddress: "ul. Test 1",
  city: "Warsaw",
  postalCode: "00-001",
  businessEmail: null,
  verifiedEmail: "buyer@example.com",
  emailVerifiedAt: "2026-08-17T10:00:00.000Z",
  accountUsername: "test2",
  accountRepoGuid: "00000000-0000-0000-0000-000000000002",
};

function sampleContext(overrides?: Partial<LicensePurchaseRecordContext>): LicensePurchaseRecordContext {
  return {
    licenseId: "lic-test-001",
    acceptedAt: "2026-08-17T10:05:00.000Z",
    acceptedBy: "test2",
    snapshot: sampleSnapshot,
    payment: {
      checkoutSessionId: "cs_test_123",
      paymentIntentId: "pi_test_123",
      status: "completed",
      kind: "user_payment",
      stripeMode: "live",
      provider: "stripe",
      confirmedAt: "2026-08-17T10:06:00.000Z",
    },
    ...overrides,
  };
}

describe("license purchase record PDF", () => {
  it("produces deterministic PDF bytes from snapshot context", async () => {
    const ctx = sampleContext();
    const pdf1 = await buildLicenseAgreementPdf(ctx);
    const pdf2 = await buildLicenseAgreementPdf(ctx);
    expect(pdf1.length).toBeGreaterThan(800);
    expect(Buffer.from(pdf1).equals(Buffer.from(pdf2))).toBe(true);
    expect(agreementPdfHash(pdf1)).toBe(agreementPdfHash(pdf2));
  });

  it("includes record sections and full agreement in one PDF", async () => {
    const ctx = sampleContext();
    const pdf = await buildLicenseAgreementPdf(ctx);
    expect(Buffer.from(pdf).subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(800);

    const canonical = buildLicensePurchaseRecordCanonicalText(ctx);
    expect(canonical).toContain("Example Sp. z o.o.");
    expect(canonical).toContain('"licensePeriod":"1 month"');
    expect(canonical).toContain('"amountMinor":80000');
    expect(canonical).toContain("cs_test_123");
    expect(canonical).toContain("1.0-DRAFT");
    expect(canonical).toContain("Sample agreement body");
    expect(canonical).not.toContain("NOT A REAL TRANSACTION");
  });

  it("logical hash is stable; company/price/agreement changes alter it", () => {
    const ctx = sampleContext();
    const h1 = agreementRecordLogicalHash(ctx);
    const h2 = agreementRecordLogicalHash(ctx);
    expect(h1).toBe(h2);
    expect(buildLicensePurchaseRecordCanonicalText(ctx)).toContain("Example Sp. z o.o.");

    const companyChanged = agreementRecordLogicalHash({
      ...ctx,
      snapshot: { ...sampleSnapshot, legalBusinessName: "Other Sp. z o.o." },
    });
    expect(companyChanged).not.toBe(h1);

    const priceChanged = agreementRecordLogicalHash({
      ...ctx,
      snapshot: { ...sampleSnapshot, amountMinor: 160000 },
    });
    expect(priceChanged).not.toBe(h1);

    const agreementChanged = agreementRecordLogicalHash({
      ...ctx,
      snapshot: { ...sampleSnapshot, agreementBody: "Different agreement text." },
    });
    expect(agreementChanged).not.toBe(h1);
  });

  it("pdf hash changes when snapshot changes", async () => {
    const ctx = sampleContext();
    const pdfA = await buildLicenseAgreementPdf(ctx);
    const pdfB = await buildLicenseAgreementPdf({
      ...ctx,
      snapshot: { ...sampleSnapshot, legalBusinessName: "Other Sp. z o.o." },
    });
    expect(agreementPdfHash(pdfA)).not.toBe(agreementPdfHash(pdfB));
  });
});
