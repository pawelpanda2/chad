/**
 * Immutable License Purchase & Agreement Record PDF — built exclusively from
 * the acceptance snapshot and linked payment fields captured at purchase time.
 *
 * Hash model:
 * - agreementRecordLogicalHash — SHA-256 of canonical JSON (stable, documented)
 * - agreementPdfHash — SHA-256 of rendered PDF bytes (pdf-lib output is stable
 *   for the same content when no generation timestamps are embedded)
 */
import { createHash } from "node:crypto";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { LicenseAcceptanceSnapshot } from "./license-commerce.js";
import { declarationText, formatUserCountLabel } from "./license-commerce.js";

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 50;
const LINE_HEIGHT = 13;
const FONT_SIZE = 9;
const TITLE_SIZE = 16;
const SECTION_SIZE = 11;

export interface LicensePurchaseRecordContext {
  licenseId: string;
  acceptedAt: string;
  acceptedBy: string;
  snapshot: LicenseAcceptanceSnapshot;
  payment: {
    checkoutSessionId: string | null;
    paymentIntentId: string | null;
    status: string | null;
    kind: string | null;
    stripeMode: string | null;
    provider: string | null;
    confirmedAt: string | null;
  };
}

function formatMoney(amountMinor: number, currency: string): string {
  return `${(amountMinor / 100).toFixed(2)} ${currency}`;
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toISOString();
}

function paymentStatusLabel(status: string | null): string {
  if (!status) return "—";
  if (status === "completed") return "Paid";
  return status;
}

function wrapLines(text: string, maxChars: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (paragraph.trim().length === 0) {
      lines.push("");
      continue;
    }
    const words = paragraph.split(/\s+/);
    let current = "";
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (next.length > maxChars) {
        if (current) lines.push(current);
        current = word;
      } else {
        current = next;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

export function buildLicensePurchaseRecordCanonicalText(ctx: LicensePurchaseRecordContext): string {
  return JSON.stringify({
    licenseId: ctx.licenseId,
    acceptedAt: ctx.acceptedAt,
    acceptedBy: ctx.acceptedBy,
    snapshot: ctx.snapshot,
    payment: ctx.payment,
  });
}

export function agreementRecordLogicalHash(ctx: LicensePurchaseRecordContext): string {
  return createHash("sha256").update(buildLicensePurchaseRecordCanonicalText(ctx), "utf8").digest("hex");
}

function recordSections(ctx: LicensePurchaseRecordContext): string[] {
  const { snapshot: s } = ctx;
  const total = formatMoney(s.amountMinor, s.currency);
  const unitMinor = Math.round(s.amountMinor / Math.max(1, s.userCount));
  const unit = formatMoney(unitMinor, s.currency);
  const rep = s.accountUsername;

  return [
    "CHAD Dashboard",
    "License Purchase & Agreement Record",
    "",
    `License ID\t${ctx.licenseId}`,
    `Purchase date\t${formatDateTime(ctx.payment.confirmedAt ?? ctx.acceptedAt)}`,
    `Licensee\t${s.legalBusinessName}`,
    `Authorized representative\t${rep}`,
    `Authorized users\t${formatUserCountLabel(s.userCount)}`,
    `License term\t1 month`,
    `Unit price\t${unit} per user`,
    `Total license fee\t${total}`,
    `Payment method\t${s.paymentMethod ?? ctx.payment.provider ?? "—"}`,
    `Payment status\t${paymentStatusLabel(ctx.payment.status)}`,
    `Agreement version\t${s.agreementVersion}`,
    "",
    "Licensee business details",
    `Legal business name\t${s.legalBusinessName}`,
    `Country\t${s.country}`,
    ...(s.state ? [`State / region\t${s.state}`] : []),
    ...(s.filingId ? [`Tax ID / NIP\t${s.filingId}`] : []),
    ...(s.businessAddress ? [`Address\t${s.businessAddress}`] : []),
    ...(s.city ? [`City\t${s.city}`] : []),
    ...(s.postalCode ? [`Postal code\t${s.postalCode}`] : []),
    ...(s.businessEmail ? [`Business email\t${s.businessEmail}`] : []),
    "",
    "Electronic verification and acceptance record",
    `Account email verification\tVerified by one-time email code (OTP)`,
    `Verified email\t${s.verifiedEmail ?? "—"}`,
    `Email verified at\t${formatDateTime(s.emailVerifiedAt)}`,
    `Agreement displayed\t${s.agreementTitle}`,
    `Agreement accepted at\t${formatDateTime(ctx.acceptedAt)}`,
    `Accepted by\t${ctx.acceptedBy}`,
    `Declaration\tAuthorized to act on behalf of ${s.legalBusinessName}`,
    `Agreement SHA-256\t${s.agreementSha256}`,
    "",
    "Acceptance declaration",
    declarationText(s),
    "",
    "Payment record",
    `Provider\t${ctx.payment.provider ?? s.paymentMethod ?? "—"}`,
    `Mode\t${ctx.payment.stripeMode ?? "—"}`,
    `payment_kind\t${ctx.payment.kind ?? "—"}`,
    `Amount\t${total}`,
    `Status\t${paymentStatusLabel(ctx.payment.status)}`,
    `Checkout Session ID\t${ctx.payment.checkoutSessionId ?? "—"}`,
    `PaymentIntent ID\t${ctx.payment.paymentIntentId ?? "—"}`,
    ...(ctx.payment.confirmedAt
      ? [`Provider confirmation time\t${formatDateTime(ctx.payment.confirmedAt)}`]
      : []),
    "",
    s.agreementTitle,
    "",
    ...wrapLines(s.agreementBody, 95),
    "",
    "Document integrity record",
    `Agreement SHA-256\t${s.agreementSha256}`,
    `Record logical SHA-256\t${agreementRecordLogicalHash(ctx)}`,
    `Generated at\t${formatDateTime(ctx.acceptedAt)}`,
  ];
}

export async function buildLicenseAgreementPdf(ctx: LicensePurchaseRecordContext): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const lines = recordSections(ctx);

  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  const drawLine = (text: string, style: "title" | "section" | "body" = "body") => {
    if (y < MARGIN + LINE_HEIGHT) {
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
    const size = style === "title" ? TITLE_SIZE : style === "section" ? SECTION_SIZE : FONT_SIZE;
    page.drawText(text, {
      x: MARGIN,
      y,
      size,
      font: style === "body" ? font : fontBold,
      color: rgb(0, 0, 0),
      maxWidth: PAGE_WIDTH - MARGIN * 2,
    });
    y -= size + (style === "title" ? 8 : 4);
  };

  for (const line of lines) {
    if (line === "CHAD Dashboard") {
      drawLine(line, "title");
      continue;
    }
    if (
      line === "License Purchase & Agreement Record" ||
      line.endsWith("business details") ||
      line.startsWith("Electronic verification") ||
      line === "Acceptance declaration" ||
      line === "Payment record" ||
      line === "Document integrity record" ||
      line.startsWith("CHAD DASHBOARD LICENSE AGREEMENT")
    ) {
      drawLine(line, "section");
      continue;
    }
    drawLine(line, "body");
  }

  return doc.save();
}

export function agreementPdfHash(pdfBytes: Uint8Array): string {
  return createHash("sha256").update(pdfBytes).digest("hex");
}

export async function buildLicenseAgreementPdfWithHash(ctx: LicensePurchaseRecordContext): Promise<{
  pdf: Uint8Array;
  pdfHash: string;
  logicalHash: string;
}> {
  const pdf = await buildLicenseAgreementPdf(ctx);
  return {
    pdf,
    pdfHash: agreementPdfHash(pdf),
    logicalHash: agreementRecordLogicalHash(ctx),
  };
}

/** @deprecated Use buildLicenseAgreementPdf(ctx) */
export async function buildLicenseAgreementPdfLegacy(
  snapshot: LicenseAcceptanceSnapshot,
  acceptedAt?: string,
  licenseId = "unknown",
): Promise<Uint8Array> {
  return buildLicenseAgreementPdf({
    licenseId,
    acceptedAt: acceptedAt ?? snapshot.emailVerifiedAt,
    acceptedBy: snapshot.accountUsername,
    snapshot,
    payment: {
      checkoutSessionId: null,
      paymentIntentId: null,
      status: null,
      kind: null,
      stripeMode: null,
      provider: snapshot.paymentMethod ?? null,
      confirmedAt: null,
    },
  });
}
