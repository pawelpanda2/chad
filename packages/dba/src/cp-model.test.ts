/**
 * cp-model.ts tests — model validation + the address/index algorithm
 * ported from the real Content Provider C# code (Story 72). Follows this
 * package's existing hand-rolled test convention (see
 * `repo-access.test.ts`): run via `npx tsc && node dist/cp-model.test.js`.
 */

import {
  validateCpItem,
  formatChildIndex,
  parseChildIndex,
  nextChildIndexFromSiblings,
  splitAddress,
  joinCpAddress,
  addressToRepoAndLoca,
  repoAndLocaToAddress,
  formatCpTimestamp,
  type CpItem,
} from "./cp-model.js";

function runTests() {
  console.log("Running cp-model Tests...\n");
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

  function assertThrows(fn: () => void, message?: string) {
    try {
      fn();
    } catch {
      return;
    }
    throw new Error(message ?? "expected function to throw, but it did not");
  }

  const REPO = "21d11bdc-f1f4-44d1-b61a-3fa6b039c641";

  function validItem(overrides: Partial<CpItem["config"]> = {}): CpItem {
    return {
      _id: "cb7bc372-781c-4ba6-b7b2-cb9ed60e0202",
      config: {
        id: "cb7bc372-781c-4ba6-b7b2-cb9ed60e0202",
        address: `${REPO}/04/02/84`,
        type: "Text",
        name: "84",
        ...overrides,
      },
      body: "hello",
    };
  }

  // --- validateCpItem ---

  test("valid item passes validation", () => {
    assertEquals(validateCpItem(validItem()).ok, true);
  });

  test("missing _id fails", () => {
    const item = validItem();
    (item as any)._id = "";
    const result = validateCpItem(item);
    assertEquals(result.ok, false);
  });

  test("missing config.address fails", () => {
    const item = validItem({ address: "" });
    const result = validateCpItem(item);
    assertEquals(result.ok, false);
  });

  test("_id != config.id fails", () => {
    const item = validItem();
    item.config.id = "different-id";
    const result = validateCpItem(item);
    assertEquals(result.ok, false);
  });

  test("body must be a string", () => {
    const item = validItem();
    (item as any).body = { not: "a string" };
    const result = validateCpItem(item);
    assertEquals(result.ok, false);
  });

  test("custom config fields don't affect validity", () => {
    const item = validItem({ googleDocId: "abc", myCustomField: 123 } as any);
    assertEquals(validateCpItem(item).ok, true);
  });

  test("custom fields are preserved (not stripped) on the item object itself", () => {
    const item = validItem({ myCustomField: "keep-me" } as any);
    assertEquals((item.config as any).myCustomField, "keep-me");
  });

  test("address with a non-numeric loca segment fails (a bare repo name/guid alone is valid — CP allows name-based repo lookup too)", () => {
    const item = validItem({ address: `${REPO}/not-a-number` });
    assertEquals(validateCpItem(item).ok, false);
  });

  // --- formatChildIndex / parseChildIndex ---

  test("formatChildIndex pads single digits", () => {
    assertEquals(formatChildIndex(1), "01");
    assertEquals(formatChildIndex(9), "09");
  });

  test("formatChildIndex does not pad two digits", () => {
    assertEquals(formatChildIndex(10), "10");
    assertEquals(formatChildIndex(99), "99");
  });

  test("formatChildIndex handles three digits", () => {
    assertEquals(formatChildIndex(100), "100");
    assertEquals(formatChildIndex(999), "999");
  });

  test("formatChildIndex rejects out-of-range", () => {
    assertThrows(() => formatChildIndex(0));
    assertThrows(() => formatChildIndex(1000));
  });

  test("parseChildIndex parses 01-09/10-99/100-999", () => {
    assertEquals(parseChildIndex("01"), 1);
    assertEquals(parseChildIndex("42"), 42);
    assertEquals(parseChildIndex("999"), 999);
  });

  test("parseChildIndex rejects non-numeric / too-long segments", () => {
    assertThrows(() => parseChildIndex("abc"));
    assertThrows(() => parseChildIndex("1234"));
  });

  // --- nextChildIndexFromSiblings ---

  test("next child index is 01 with no siblings", () => {
    assertEquals(nextChildIndexFromSiblings(`${REPO}/03/06`, []), "01");
  });

  test("next child index is max+1 among existing numeric siblings", () => {
    const siblings = [`${REPO}/03/06/01`, `${REPO}/03/06/02`, `${REPO}/03/06/05`];
    assertEquals(nextChildIndexFromSiblings(`${REPO}/03/06`, siblings), "06");
  });

  test("next child index ignores non-direct-descendant addresses", () => {
    const siblings = [`${REPO}/03/06/01`, `${REPO}/03/06/01/99`, `${REPO}/other/01`];
    assertEquals(nextChildIndexFromSiblings(`${REPO}/03/06`, siblings), "02");
  });

  test("next child index rolls from 09 to 10", () => {
    const siblings = Array.from({ length: 9 }, (_, i) => `${REPO}/p/0${i + 1}`);
    assertEquals(nextChildIndexFromSiblings(`${REPO}/p`, siblings), "10");
  });

  // --- address helpers ---

  test("splitAddress separates repo guid and segments", () => {
    assertEquals(splitAddress(`${REPO}/04/02/84`), { repoGuid: REPO, segments: ["04", "02", "84"] });
  });

  test("splitAddress handles bare repo root", () => {
    assertEquals(splitAddress(REPO), { repoGuid: REPO, segments: [] });
  });

  test("joinCpAddress is the inverse of splitAddress", () => {
    assertEquals(joinCpAddress(REPO, ["04", "02", "84"]), `${REPO}/04/02/84`);
    assertEquals(joinCpAddress(REPO, []), REPO);
  });

  test("addressToRepoAndLoca matches PathWorker's (Repo, Loca) tuple shape", () => {
    assertEquals(addressToRepoAndLoca(`${REPO}/04/02`), { repo: REPO, loca: "04/02" });
    assertEquals(addressToRepoAndLoca(REPO), { repo: REPO, loca: "" });
  });

  test("repoAndLocaToAddress is the inverse of addressToRepoAndLoca", () => {
    assertEquals(repoAndLocaToAddress(REPO, "04/02"), `${REPO}/04/02`);
    assertEquals(repoAndLocaToAddress(REPO, ""), REPO);
  });

  // --- timestamp format ---

  test("formatCpTimestamp produces YYMMDD_HHMMSS", () => {
    const date = new Date(2026, 6, 18, 12, 5, 9); // months are 0-indexed
    assertEquals(formatCpTimestamp(date), "260718_120509");
  });

  // Summary
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
