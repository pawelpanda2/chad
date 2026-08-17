/**
 * Admin → Licenses — read-only view of all license acceptances + linked payments.
 */
import { withPostgresClient } from "./postgres.js";
import { LicenseCommerceError, type LicenseAcceptanceSnapshot } from "./license-commerce.js";
import {
  agreementPdfHash,
  agreementRecordLogicalHash,
  buildLicenseAgreementPdf,
  type LicensePurchaseRecordContext,
} from "./license-agreement-pdf.js";

export interface AdminLicenseListRow {
  id: string;
  company: string;
  username: string;
  repoGuid: string;
  userCount: number;
  licensePeriod: string;
  amountMinor: number;
  currency: string;
  status: string;
  purchasedAt: string | null;
  agreementVersion: string;
  acceptedAt: string;
}

export interface AdminLicenseDetail extends AdminLicenseListRow {
  verifiedEmail: string | null;
  emailVerifiedAt: string | null;
  paymentMethod: string | null;
  paymentKind: string | null;
  stripeMode: string | null;
  paymentStatus: string | null;
  checkoutSessionId: string | null;
  paymentIntentId: string | null;
  agreementTextHash: string;
  agreementRecordLogicalHash: string;
  acceptedBy: string;
  businessSnapshot: LicenseAcceptanceSnapshot;
  generatedAt: string;
  agreementPdfHash: string;
  licenseActivatedAt: string | null;
  planId: string;
}

function deriveStatus(paymentStatus: string | null, licenseActivatedAt: string | null): string {
  if (paymentStatus === "completed") {
    return licenseActivatedAt ? "active" : "paid";
  }
  if (paymentStatus === "pending") return "payment_pending";
  if (paymentStatus === "failed") return "payment_failed";
  if (paymentStatus === "canceled") return "payment_canceled";
  return "accepted";
}

interface AcceptancePaymentRow {
  id: string;
  repo_guid: string;
  username: string;
  plan_id: string;
  agreement_version: string;
  agreement_sha256: string;
  snapshot: LicenseAcceptanceSnapshot;
  accepted_at: string;
  payment_id: string | null;
  payment_status: string | null;
  payment_kind: string | null;
  stripe_mode: string | null;
  payment_provider: string | null;
  payment_intent_id: string | null;
  payment_created_at: string | null;
  license_activated_at: string | null;
}

const ADMIN_LICENSES_BASE = `
  SELECT a.id, a.repo_guid, a.username, a.plan_id, a.agreement_version, a.agreement_sha256,
         a.snapshot, a.accepted_at,
         p.id AS payment_id, p.status AS payment_status, p.kind AS payment_kind,
         p.stripe_mode, p.provider AS payment_provider,
         p.stripe_payment_intent_id AS payment_intent_id, p.created_at AS payment_created_at,
         p.license_activated_at
  FROM cp_license_acceptances a
  LEFT JOIN cp_stripe_payments p ON p.license_acceptance_id = a.id
`;

function toRecordContext(r: AcceptancePaymentRow): LicensePurchaseRecordContext {
  return {
    licenseId: r.id,
    acceptedAt: r.accepted_at,
    acceptedBy: r.username,
    snapshot: r.snapshot,
    payment: {
      checkoutSessionId: r.payment_id,
      paymentIntentId: r.payment_intent_id,
      status: r.payment_status,
      kind: r.payment_kind,
      stripeMode: r.stripe_mode,
      provider: r.payment_provider,
      confirmedAt: r.payment_status === "completed" ? r.payment_created_at : null,
    },
  };
}

function mapListRow(r: AcceptancePaymentRow): AdminLicenseListRow {
  const snapshot = r.snapshot;
  const purchasedAt =
    r.payment_status === "completed" && r.payment_created_at ? r.payment_created_at : null;
  return {
    id: r.id,
    company: snapshot.legalBusinessName,
    username: r.username,
    repoGuid: r.repo_guid,
    userCount: snapshot.userCount,
    licensePeriod: snapshot.licensePeriodMonths === 1 ? "1 month" : snapshot.licensePeriod,
    amountMinor: snapshot.amountMinor,
    currency: snapshot.currency,
    status: deriveStatus(r.payment_status, r.license_activated_at),
    purchasedAt,
    agreementVersion: r.agreement_version,
    acceptedAt: r.accepted_at,
  };
}

export async function getLicensesForAdmin(limit = 500): Promise<AdminLicenseListRow[]> {
  return withPostgresClient(async (client) => {
    const { rows } = await client.query<AcceptancePaymentRow>(
      `${ADMIN_LICENSES_BASE} ORDER BY a.accepted_at DESC LIMIT $1`,
      [limit],
    );
    return rows.map(mapListRow);
  });
}

export async function getLicenseDetailForAdmin(acceptanceId: string): Promise<AdminLicenseDetail> {
  return withPostgresClient(async (client) => {
    const { rows } = await client.query<AcceptancePaymentRow>(
      `${ADMIN_LICENSES_BASE} WHERE a.id = $1 LIMIT 1`,
      [acceptanceId],
    );
    if (rows.length === 0) {
      throw new LicenseCommerceError("acceptance_not_found", "License not found.");
    }
    const r = rows[0];
    const snapshot = r.snapshot;
    const list = mapListRow(r);
    const ctx = toRecordContext(r);
    const pdf = await buildLicenseAgreementPdf(ctx);

    return {
      ...list,
      verifiedEmail: snapshot.verifiedEmail ?? null,
      emailVerifiedAt: snapshot.emailVerifiedAt ?? null,
      paymentMethod: snapshot.paymentMethod ?? null,
      paymentKind: r.payment_kind,
      stripeMode: r.stripe_mode,
      paymentStatus: r.payment_status,
      checkoutSessionId: r.payment_id,
      paymentIntentId: r.payment_intent_id,
      agreementTextHash: r.agreement_sha256,
      agreementRecordLogicalHash: agreementRecordLogicalHash(ctx),
      acceptedBy: r.username,
      businessSnapshot: snapshot,
      generatedAt: r.accepted_at,
      agreementPdfHash: agreementPdfHash(pdf),
      licenseActivatedAt: r.license_activated_at,
      planId: r.plan_id,
    };
  });
}

export async function getLicenseAgreementPdfForAdmin(acceptanceId: string): Promise<{
  pdf: Uint8Array;
  filename: string;
  hash: string;
  logicalHash: string;
}> {
  return withPostgresClient(async (client) => {
    const { rows } = await client.query<AcceptancePaymentRow>(
      `${ADMIN_LICENSES_BASE} WHERE a.id = $1 LIMIT 1`,
      [acceptanceId],
    );
    if (rows.length === 0) {
      throw new LicenseCommerceError("acceptance_not_found", "License not found.");
    }
    const ctx = toRecordContext(rows[0]);
    const snapshot = rows[0].snapshot;
    const pdf = await buildLicenseAgreementPdf(ctx);
    const company = snapshot.legalBusinessName.replace(/[^\w.-]+/g, "_").slice(0, 40);
    return {
      pdf,
      hash: agreementPdfHash(pdf),
      logicalHash: agreementRecordLogicalHash(ctx),
      filename: `license-${company}-${snapshot.agreementVersion}-${rows[0].id.slice(0, 8)}.pdf`,
    };
  });
}
