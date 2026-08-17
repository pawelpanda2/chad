/**
 * Lazy env reads — same convention as packages/dba's mongo.ts/postgres.ts.
 */
import { LiveStripeKeyForbiddenError, PaymentsNotConfiguredError } from "./errors.js";

function chadEnvironment(): string {
  return process.env.CHAD_ENVIRONMENT || "local";
}

/** Stripe Sandbox / test — admin test payments and legacy local checkout. */
export function requireStripeTestSecretKey(): string {
  const value = process.env.STRIPE_SECRET_KEY;
  if (!value) {
    throw new PaymentsNotConfiguredError(
      "STRIPE_SECRET_KEY is not configured — Stripe Sandbox Checkout is unavailable.",
    );
  }
  if (value.startsWith("sk_live_")) {
    throw new PaymentsNotConfiguredError(
      "STRIPE_SECRET_KEY must be a test/sandbox key — use STRIPE_LIVE_SECRET_KEY for LIVE user payments.",
    );
  }
  return value;
}

/** Stripe LIVE — user license purchases only. */
export function requireStripeLiveSecretKey(): string {
  const value = process.env.STRIPE_LIVE_SECRET_KEY;
  if (!value) {
    throw new PaymentsNotConfiguredError(
      "STRIPE_LIVE_SECRET_KEY is not configured — LIVE Stripe Checkout is unavailable.",
    );
  }
  if (!value.startsWith("sk_live_")) {
    throw new PaymentsNotConfiguredError(
      "STRIPE_LIVE_SECRET_KEY must be a live key (sk_live_…).",
    );
  }
  const env = chadEnvironment();
  if (env !== "prod" && env !== "local") {
    throw new LiveStripeKeyForbiddenError(
      `LIVE Stripe keys are not allowed when CHAD_ENVIRONMENT=${env}.`,
    );
  }
  return value;
}

export function isStripeLiveConfigured(): boolean {
  const value = process.env.STRIPE_LIVE_SECRET_KEY;
  return Boolean(value?.startsWith("sk_live_"));
}

/** @deprecated Use requireStripeTestSecretKey or requireStripeLiveSecretKey. */
export function requireStripeSecretKey(): string {
  return requireStripeTestSecretKey();
}

export function requireStripeTestWebhookSecret(): string {
  const value = process.env.STRIPE_WEBHOOK_SECRET;
  if (!value) {
    throw new PaymentsNotConfiguredError(
      "STRIPE_WEBHOOK_SECRET is not configured — Stripe test webhooks are unavailable.",
    );
  }
  return value;
}

export function requireStripeLiveWebhookSecret(): string {
  const value = process.env.STRIPE_LIVE_WEBHOOK_SECRET;
  if (!value) {
    throw new PaymentsNotConfiguredError(
      "STRIPE_LIVE_WEBHOOK_SECRET is not configured — Stripe LIVE webhooks are unavailable.",
    );
  }
  return value;
}

const DEFAULT_MAX_AMOUNT_MAJOR = 100_000;

export function getMaxAmountMajor(): number {
  const raw = process.env.PAYMENTS_MAX_AMOUNT_MAJOR_PLN;
  if (!raw) {
    return DEFAULT_MAX_AMOUNT_MAJOR;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_MAX_AMOUNT_MAJOR;
  }
  return parsed;
}
