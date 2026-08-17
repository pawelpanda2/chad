/**
 * Story 116 — unit tests for packages/payments's amount validation
 * (§1.5/§1.13). Physically located under packages/dba/src rather than
 * packages/payments/src: a pre-existing Vitest/vite-oxc toolchain issue in
 * this environment fails transform for ANY test file placed directly
 * inside a leaf `packages/*` workspace package other than dba/dashboard
 * (reproduced independently with a trivial probe test in packages/mcp and
 * packages/google-contacts — not something this Story introduced). Testing
 * from dba (the only real consumer of packages/payments, per the required
 * Dashboard -> dba -> payments -> Stripe flow) sidesteps it without any
 * change to production code. See backlog/stories/116/06_others_from_report.md.
 */
import { describe, it, expect, afterEach } from "vitest";
import { parseAmountToMinorUnits, PAYMENTS_CURRENCY, InvalidAmountError, requireStripeSecretKey, LiveStripeKeyForbiddenError } from "payments";

afterEach(() => {
  delete process.env.PAYMENTS_MAX_AMOUNT_MAJOR_PLN;
});

describe("parseAmountToMinorUnits", () => {
  it("accepts a whole-number PLN amount", () => {
    const result = parseAmountToMinorUnits("500");
    expect(result.minorUnits).toBe(50000);
    expect(result.currency).toBe(PAYMENTS_CURRENCY);
    expect(result.displayMajor).toBe("500.00");
  });

  it("accepts an amount with 2 decimal places", () => {
    expect(parseAmountToMinorUnits("500.50").minorUnits).toBe(50050);
  });

  it("accepts 1 PLN", () => {
    expect(parseAmountToMinorUnits("1").minorUnits).toBe(100);
  });

  it("accepts a number input, not just a string", () => {
    expect(parseAmountToMinorUnits(2000).minorUnits).toBe(200000);
  });

  it("trims incidental surrounding whitespace", () => {
    expect(parseAmountToMinorUnits(" 500 ").minorUnits).toBe(50000);
  });

  it("converts without floating-point drift (string-based integer math)", () => {
    // A classic float trap: 0.1 + 0.2 !== 0.3 in IEEE-754. Confirms the
    // string/BigInt path never routes through float arithmetic.
    expect(parseAmountToMinorUnits("0.1").minorUnits).toBe(10);
    expect(parseAmountToMinorUnits("0.2").minorUnits).toBe(20);
    expect(parseAmountToMinorUnits("19.99").minorUnits).toBe(1999);
    expect(parseAmountToMinorUnits("2403.99").minorUnits).toBe(240399);
  });

  it("rejects zero", () => {
    expect(() => parseAmountToMinorUnits("0")).toThrow(InvalidAmountError);
    expect(() => parseAmountToMinorUnits("0.00")).toThrow(InvalidAmountError);
  });

  it("rejects negative amounts", () => {
    expect(() => parseAmountToMinorUnits("-10")).toThrow(InvalidAmountError);
    expect(() => parseAmountToMinorUnits(-10)).toThrow(InvalidAmountError);
  });

  it("rejects non-numeric text", () => {
    expect(() => parseAmountToMinorUnits("abc")).toThrow(InvalidAmountError);
    expect(() => parseAmountToMinorUnits("500 PLN")).toThrow(InvalidAmountError);
    expect(() => parseAmountToMinorUnits("500,00")).toThrow(InvalidAmountError);
  });

  it("rejects NaN and Infinity", () => {
    expect(() => parseAmountToMinorUnits(NaN)).toThrow(InvalidAmountError);
    expect(() => parseAmountToMinorUnits(Infinity)).toThrow(InvalidAmountError);
    expect(() => parseAmountToMinorUnits(-Infinity)).toThrow(InvalidAmountError);
    expect(() => parseAmountToMinorUnits("NaN")).toThrow(InvalidAmountError);
    expect(() => parseAmountToMinorUnits("Infinity")).toThrow(InvalidAmountError);
  });

  it("rejects scientific notation and other malformed formats", () => {
    expect(() => parseAmountToMinorUnits("1e3")).toThrow(InvalidAmountError);
    expect(() => parseAmountToMinorUnits("+500")).toThrow(InvalidAmountError);
    expect(() => parseAmountToMinorUnits("500.")).toThrow(InvalidAmountError);
    expect(() => parseAmountToMinorUnits("")).toThrow(InvalidAmountError);
  });

  it("rejects more than 2 decimal places", () => {
    expect(() => parseAmountToMinorUnits("500.123")).toThrow(InvalidAmountError);
    expect(() => parseAmountToMinorUnits("1.999")).toThrow(InvalidAmountError);
  });

  it("rejects non-string/number types outright", () => {
    expect(() => parseAmountToMinorUnits(null)).toThrow(InvalidAmountError);
    expect(() => parseAmountToMinorUnits(undefined)).toThrow(InvalidAmountError);
    expect(() => parseAmountToMinorUnits({ amount: 500 })).toThrow(InvalidAmountError);
    expect(() => parseAmountToMinorUnits(["500"])).toThrow(InvalidAmountError);
    expect(() => parseAmountToMinorUnits(true)).toThrow(InvalidAmountError);
  });

  it("enforces the configurable technical max, not a hardcoded PLN limit", () => {
    process.env.PAYMENTS_MAX_AMOUNT_MAJOR_PLN = "1000";
    expect(() => parseAmountToMinorUnits("1000")).not.toThrow();
    expect(() => parseAmountToMinorUnits("1000.01")).toThrow(InvalidAmountError);
    expect(() => parseAmountToMinorUnits("2403")).toThrow(InvalidAmountError);
  });

  it("always returns PLN regardless of what the caller might wish for — currency is not a parameter", () => {
    // parseAmountToMinorUnits has no currency argument at all: the return
    // type's `currency` field is architecturally always PAYMENTS_CURRENCY,
    // which is how "the client can't swap the currency" is enforced.
    const result = parseAmountToMinorUnits("500");
    expect(result.currency).toBe("PLN");
  });
});

describe("requireStripeSecretKey — live keys forbidden outside prod", () => {
  const originalEnv = process.env.CHAD_ENVIRONMENT;
  const originalKey = process.env.STRIPE_SECRET_KEY;

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.CHAD_ENVIRONMENT;
    else process.env.CHAD_ENVIRONMENT = originalEnv;
    if (originalKey === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = originalKey;
  });

  it("rejects sk_live_ when CHAD_ENVIRONMENT=local", () => {
    process.env.CHAD_ENVIRONMENT = "local";
    process.env.STRIPE_SECRET_KEY = "sk_live_dummy_must_not_be_used";
    expect(() => requireStripeSecretKey()).toThrow(LiveStripeKeyForbiddenError);
  });
});
