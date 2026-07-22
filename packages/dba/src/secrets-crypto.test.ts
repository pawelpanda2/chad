/**
 * secrets-crypto.ts tests — pure, no I/O (generates its own throwaway key
 * per run via env var manipulation).
 * Run via: cd packages/dba && npx tsc && node dist/secrets-crypto.test.js
 */

import { randomBytes } from "node:crypto";
import { encryptSecret, decryptSecret } from "./secrets-crypto.js";

async function runTests() {
  console.log("Running secrets-crypto Tests...\n");
  let passed = 0;
  let failed = 0;

  function test(name: string, fn: () => void) {
    try {
      fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (e) {
      console.log(`  ✗ ${name}`);
      console.log(`    Error: ${e}`);
      failed++;
    }
  }

  function assertEquals(actual: unknown, expected: unknown, message?: string) {
    if (actual !== expected) throw new Error(`${message ?? "Assertion failed"}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }

  const originalKey = process.env.SECRETS_ENCRYPTION_KEY;
  process.env.SECRETS_ENCRYPTION_KEY = randomBytes(32).toString("base64");

  test("encrypt then decrypt round-trips to the exact original plaintext", () => {
    const original = "Zelazna6764??";
    const encrypted = encryptSecret(original);
    assertEquals(decryptSecret(encrypted), original);
  });

  test("encrypting the same plaintext twice produces different ciphertext (random IV)", () => {
    const a = encryptSecret("same-input");
    const b = encryptSecret("same-input");
    if (a === b) throw new Error("ciphertext must differ across calls (random IV)");
  });

  test("encrypted value round-trips a value with special characters/unicode", () => {
    const original = "p@ss:w/ord?with?symbols?ąćę??";
    assertEquals(decryptSecret(encryptSecret(original)), original);
  });

  test("decrypt throws on malformed stored value (not iv.authTag.ciphertext)", () => {
    let threw = false;
    try {
      decryptSecret("not-a-valid-format");
    } catch {
      threw = true;
    }
    if (!threw) throw new Error("expected decryptSecret to throw on malformed input");
  });

  test("decrypt throws when the auth tag doesn't verify (tampered ciphertext)", () => {
    const encrypted = encryptSecret("original-value");
    const [iv, authTag, ciphertext] = encrypted.split(".");
    const tampered = [iv, authTag, ciphertext.slice(0, -2) + "AA"].join(".");
    let threw = false;
    try {
      decryptSecret(tampered);
    } catch {
      threw = true;
    }
    if (!threw) throw new Error("expected decryptSecret to throw on tampered ciphertext");
  });

  test("encryptSecret throws a clear error when SECRETS_ENCRYPTION_KEY is unset", () => {
    delete process.env.SECRETS_ENCRYPTION_KEY;
    let threw = false;
    try {
      encryptSecret("x");
    } catch (e) {
      threw = e instanceof Error && e.message.includes("SECRETS_ENCRYPTION_KEY");
    }
    process.env.SECRETS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    if (!threw) throw new Error("expected a clear error naming SECRETS_ENCRYPTION_KEY");
  });

  test("encryptSecret throws when SECRETS_ENCRYPTION_KEY is the wrong length", () => {
    process.env.SECRETS_ENCRYPTION_KEY = Buffer.from("too-short").toString("base64");
    let threw = false;
    try {
      encryptSecret("x");
    } catch {
      threw = true;
    }
    process.env.SECRETS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    if (!threw) throw new Error("expected an error for a wrong-length key");
  });

  if (originalKey === undefined) delete process.env.SECRETS_ENCRYPTION_KEY;
  else process.env.SECRETS_ENCRYPTION_KEY = originalKey;

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
