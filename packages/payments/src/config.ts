/**
 * Lazy env reads — same convention as packages/dba's mongo.ts/postgres.ts:
 * never read at module load time, only when a function is actually called,
 * so a missing/late-injected env var (e.g. docker-compose env not yet
 * present when Next.js collects page data at build time) never crashes
 * import, only the specific operation that needed it — surfaced as a typed
 * PaymentsNotConfiguredError, never an unhandled exception.
 */
import { LiveStripeKeyForbiddenError, PaymentsNotConfiguredError } from "./errors.js";

function chadEnvironment(): string {
  return process.env.CHAD_ENVIRONMENT || "local";
}

export function requireStripeSecretKey(): string {
  const value = process.env.STRIPE_SECRET_KEY;
  if (!value) {
    throw new PaymentsNotConfiguredError(
      "STRIPE_SECRET_KEY is not configured — Stripe Checkout is unavailable.",
    );
  }
  const env = chadEnvironment();
  if (value.startsWith("sk_live_") && env !== "prod") {
    throw new LiveStripeKeyForbiddenError(
      `LIVE Stripe keys are not allowed when CHAD_ENVIRONMENT=${env}.`,
    );
  }
  return value;
}

export function requireStripeWebhookSecret(): string {
  const value = process.env.STRIPE_WEBHOOK_SECRET;
  if (!value) {
    throw new PaymentsNotConfiguredError(
      "STRIPE_WEBHOOK_SECRET is not configured — Stripe webhooks are unavailable.",
    );
  }
  return value;
}

/**
 * Configurable technical safety ceiling on a single payment (major units,
 * e.g. PLN) — a sanity limit against fat-finger/overflow input, not a
 * business/tax rule (no PUP logic belongs here or anywhere in this
 * package). Defaults to a generous 100,000 if unset/invalid so the feature
 * works out of the box; operators can tighten or loosen it via env without
 * a code change.
 */
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
