/**
 * Typed error hierarchy for packages/payments. Callers (packages/dba) branch
 * on `code`, never on message text.
 */
export class PaymentsError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "PaymentsError";
    this.code = code;
  }
}

/** STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET missing — a controlled error, never a crash. */
export class PaymentsNotConfiguredError extends PaymentsError {
  constructor(message: string) {
    super("not_configured", message);
    this.name = "PaymentsNotConfiguredError";
  }
}

/** Amount failed server-side validation (§1.5 — every listed rejection reason shares this code). */
export class InvalidAmountError extends PaymentsError {
  constructor(message: string) {
    super("invalid_amount", message);
    this.name = "InvalidAmountError";
  }
}

/** Stripe-Signature header missing/invalid, or raw body doesn't match it. */
export class InvalidWebhookSignatureError extends PaymentsError {
  constructor(message: string) {
    super("invalid_signature", message);
    this.name = "InvalidWebhookSignatureError";
  }
}
