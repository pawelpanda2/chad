/**
 * Pure `compareItems` mismatch-detection logic (Story 72 §16). Does not
 * touch Mongo — `recordShadowReadMismatch`'s I/O is exercised indirectly
 * via `data-router.test.ts`'s fake-provider tests instead.
 */

import { compareItems } from "./data-sync-diagnostics.js";
import type { CpItem } from "./cp-model.js";

function runTests() {
  console.log("Running data-sync-diagnostics Tests...\n");
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
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) {
      throw new Error(`${message ?? "assertEquals failed"}: expected ${e}, got ${a}`);
    }
  }

  function item(overrides: Partial<CpItem> = {}): CpItem {
    return {
      _id: "id-1",
      config: { id: "id-1", address: "repo/01", type: "Text", name: "foo" },
      body: "hello",
      ...overrides,
    };
  }

  test("identical items produce no mismatch", () => {
    assertEquals(compareItems(item(), item()), []);
  });

  test("missing in follower", () => {
    assertEquals(compareItems(item(), null), ["missing-in-follower"]);
  });

  test("missing in primary", () => {
    assertEquals(compareItems(null, item()), ["missing-in-primary"]);
  });

  test("both missing is not a mismatch", () => {
    assertEquals(compareItems(null, null), []);
  });

  test("id mismatch detected", () => {
    const result = compareItems(item(), item({ _id: "id-2", config: { ...item().config, id: "id-2" } }));
    assertEquals(result.includes("id-mismatch"), true);
  });

  test("address mismatch detected", () => {
    const result = compareItems(item(), item({ config: { ...item().config, address: "repo/02" } }));
    assertEquals(result.includes("address-mismatch"), true);
  });

  test("body mismatch detected", () => {
    const result = compareItems(item(), item({ body: "different" }));
    assertEquals(result.includes("body-mismatch"), true);
  });

  test("type mismatch detected", () => {
    const result = compareItems(item(), item({ config: { ...item().config, type: "Folder" } }));
    assertEquals(result.includes("type-mismatch"), true);
  });

  test("name mismatch detected", () => {
    const result = compareItems(item(), item({ config: { ...item().config, name: "bar" } }));
    assertEquals(result.includes("name-mismatch"), true);
  });

  test("custom config field mismatch detected as config-mismatch", () => {
    const a = item({ config: { ...item().config, customField: "a" } as any });
    const b = item({ config: { ...item().config, customField: "b" } as any });
    assertEquals(compareItems(a, b).includes("config-mismatch"), true);
  });

  test("multiple mismatches are all reported", () => {
    const result = compareItems(item(), item({ body: "different", config: { ...item().config, name: "bar" } }));
    assertEquals(result.includes("body-mismatch"), true);
    assertEquals(result.includes("name-mismatch"), true);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
