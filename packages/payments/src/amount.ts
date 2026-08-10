/**
 * Server-side amount validation/conversion (§1.5). Currency is fixed to PLN
 * inside this function's return type — the caller physically cannot make it
 * anything else, which is how "the client can't swap the currency" is
 * enforced architecturally, not just by a runtime check.
 *
 * Amounts are parsed as strings and converted to minor units (grosze) with
 * integer arithmetic only — never `Math.round(major * 100)` — so a value
 * like 19.1 can never turn into 1909999999999998 grosze the way IEEE-754
 * float multiplication occasionally produces.
 */
import { InvalidAmountError } from "./errors.js";
import { getMaxAmountMajor } from "./config.js";

export const PAYMENTS_CURRENCY = "PLN" as const;
export type PaymentsCurrency = typeof PAYMENTS_CURRENCY;

export interface ParsedAmount {
  /** Integer grosze — what Stripe's price_data.unit_amount expects. */
  minorUnits: number;
  currency: PaymentsCurrency;
  /** Normalized "500.00" form, safe for display/logging. */
  displayMajor: string;
}

// Exactly one or two decimal places, no sign, no leading '+', no exponent,
// no whitespace inside — deliberately stricter than Number()/parseFloat()
// so "1e3", "Infinity", "1,000", " 500", "500." are all rejected outright
// rather than silently coerced.
const STRICT_AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/;

/**
 * @param rawInput whatever the client sent for the amount field — deliberately
 *   typed `unknown`, since it must never be trusted as already-a-number.
 */
export function parseAmountToMinorUnits(rawInput: unknown): ParsedAmount {
  if (typeof rawInput !== "string" && typeof rawInput !== "number") {
    throw new InvalidAmountError("Amount must be a string or number.");
  }
  if (typeof rawInput === "number" && !Number.isFinite(rawInput)) {
    // Catches NaN, Infinity, -Infinity before they ever become a string.
    throw new InvalidAmountError("Amount must be a finite number.");
  }

  const trimmed = String(rawInput).trim();
  if (!STRICT_AMOUNT_PATTERN.test(trimmed)) {
    throw new InvalidAmountError(
      "Amount must be a positive number with at most 2 decimal places (e.g. \"500\" or \"500.50\").",
    );
  }

  const [integerPart, fractionalPart = ""] = trimmed.split(".");
  const paddedFractional = fractionalPart.padEnd(2, "0");
  const minorUnitsBig = BigInt(integerPart) * 100n + BigInt(paddedFractional);

  if (minorUnitsBig <= 0n) {
    throw new InvalidAmountError("Amount must be greater than zero.");
  }

  const maxMinorUnitsBig = BigInt(getMaxAmountMajor()) * 100n;
  if (minorUnitsBig > maxMinorUnitsBig) {
    throw new InvalidAmountError(
      `Amount exceeds the configured maximum of ${getMaxAmountMajor()} ${PAYMENTS_CURRENCY}.`,
    );
  }

  if (minorUnitsBig > BigInt(Number.MAX_SAFE_INTEGER)) {
    // Unreachable given the max-amount check above, kept as an explicit
    // guard so a future change to the max can't silently overflow.
    throw new InvalidAmountError("Amount is too large to process.");
  }

  const minorUnits = Number(minorUnitsBig);
  const displayMajor = `${integerPart}.${paddedFractional}`;

  return { minorUnits, currency: PAYMENTS_CURRENCY, displayMajor };
}
