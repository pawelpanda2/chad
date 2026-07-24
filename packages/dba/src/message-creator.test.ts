/**
 * Unit tests for message-creator pure helpers (Story 84).
 * Run: cd packages/dba && npx tsc && node dist/message-creator.test.js
 */

import {
  buildNextAnalysisRunName,
  computeFreshness,
  extractHistoricalYouSection,
  hashConversationContent,
  isMessageCreatorOperation,
  parseAnalysisRunBody,
  parseAnalysisRunName,
  pickLatestAnalysisRuns,
  serializeAnalysisRunBody,
  todayYyMmDd,
  type AnalysisRunSummary,
} from "./message-creator.js";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function assertEquals(a: unknown, b: unknown, msg?: string) {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error(`${msg ?? "assertEquals"}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
  }
}

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ✗ ${name}`);
    console.log(`    ${e instanceof Error ? e.message : e}`);
    failed++;
  }
}

console.log("Running message-creator unit tests...\n");

test("hashConversationContent is stable sha256", () => {
  const a = hashConversationContent("hello");
  const b = hashConversationContent("hello");
  const c = hashConversationContent("hello!");
  assert(a !== null && a === b, "same input same hash");
  assert(a !== c, "different input different hash");
  assertEquals(a?.length, 64, "sha256 hex length");
});

test("hashConversationContent null for null/undefined", () => {
  assertEquals(hashConversationContent(null), null);
  assertEquals(hashConversationContent(undefined), null);
});

test("buildNextAnalysisRunName first then letter suffix", () => {
  const today = "26-07-24";
  const n1 = buildNextAnalysisRunName(today, "sd-pl", "health", []);
  assertEquals(n1, "26-07-24; sd-pl; health");
  const n2 = buildNextAnalysisRunName(today, "sd-pl", "health", [n1]);
  assertEquals(n2, "26-07-24a; sd-pl; health");
  const n3 = buildNextAnalysisRunName(today, "sd-pl", "health", [n1, n2]);
  assertEquals(n3, "26-07-24b; sd-pl; health");
});

test("parseAnalysisRunName round-trip", () => {
  const p = parseAnalysisRunName("26-07-24b; sd-pl; next-message");
  assert(p !== null, "parsed");
  assertEquals(p!.today, "26-07-24");
  assertEquals(p!.suffix, "b");
  assertEquals(p!.schoolId, "sd-pl");
  assertEquals(p!.operation, "next-message");
  assertEquals(parseAnalysisRunName("26-07-09; ai bot"), null);
  assertEquals(parseAnalysisRunName("my proposals"), null);
});

test("computeFreshness", () => {
  assertEquals(computeFreshness(null, "abc"), "not-analyzed");
  assertEquals(computeFreshness("abc", null), "outdated");
  assertEquals(computeFreshness("abc", "abc"), "current");
  assertEquals(computeFreshness("abc", "xyz"), "outdated");
});

test("extractHistoricalYouSection", () => {
  const body = "intro\n//you\nhello world\nline2\n//other\nskip";
  assertEquals(extractHistoricalYouSection(body), "hello world\nline2");
  assertEquals(extractHistoricalYouSection("no marker"), null);
});

test("serialize/parse analysis body", () => {
  const body = serializeAnalysisRunBody({
    schemaVersion: 1,
    schoolId: "sd-pl",
    operation: "health",
    createdAt: "2026-07-24T10:00:00.000Z",
    conversationHash: "abc",
    leadName: "lead",
    status: "not-configured",
    payload: { reason: "PROMPT_NOT_CONFIGURED" },
  });
  const parsed = parseAnalysisRunBody(body);
  assert(parsed !== null, "parsed");
  assertEquals(parsed!.schoolId, "sd-pl");
  assertEquals(parsed!.operation, "health");
  assertEquals((parsed!.payload as { reason: string }).reason, "PROMPT_NOT_CONFIGURED");
});

test("pickLatestAnalysisRuns keeps first per school+op", () => {
  const runs: AnalysisRunSummary[] = [
    {
      schoolId: "sd-pl",
      operation: "health",
      itemName: "newer",
      loca: "1",
      conversationHash: "a",
      createdAt: "2026-07-24T12:00:00.000Z",
      freshness: "current",
      payload: null,
    },
    {
      schoolId: "sd-pl",
      operation: "health",
      itemName: "older",
      loca: "2",
      conversationHash: "b",
      createdAt: "2026-07-24T10:00:00.000Z",
      freshness: "outdated",
      payload: null,
    },
  ];
  const latest = pickLatestAnalysisRuns(runs);
  assertEquals(latest.length, 1);
  assertEquals(latest[0].itemName, "newer");
});

test("isMessageCreatorOperation", () => {
  assert(isMessageCreatorOperation("health"), "health");
  assert(!isMessageCreatorOperation("ai bot"), "ai bot");
});

test("todayYyMmDd shape", () => {
  assert(/^\d{2}-\d{2}-\d{2}$/.test(todayYyMmDd()), "yy-mm-dd");
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
