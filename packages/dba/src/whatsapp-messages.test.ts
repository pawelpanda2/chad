/**
 * Unit tests for WhatsApp parse / prompt options / context frame (Story 85).
 * Run: cd packages/dba && npx tsc && node dist/whatsapp-messages.test.js
 */

import {
  analysisContextMessageIds,
  buildMessagePromptVersionOptions,
  fnv1aHex,
  parseWhatsAppMessages,
  stableWhatsAppMessageId,
} from "./whatsapp-messages.js";

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

console.log("Running whatsapp-messages unit tests...\n");

test("fnv1aHex stable", () => {
  assertEquals(fnv1aHex("a"), fnv1aHex("a"));
  assert(fnv1aHex("a") !== fnv1aHex("b"), "different");
  assertEquals(fnv1aHex("hello").length, 8);
});

test("stableWhatsAppMessageId ignores list index", () => {
  const a = stableWhatsAppMessageId("01/01/2026, 10:00:00", "you", "raw-line", 1);
  const b = stableWhatsAppMessageId("01/01/2026, 10:00:00", "you", "raw-line", 1);
  assertEquals(a, b);
  const c = stableWhatsAppMessageId("01/01/2026, 10:00:00", "you", "raw-line", 2);
  assert(a !== c, "occurrence suffix");
});

test("parseWhatsAppMessages stable ids across re-parse", () => {
  const body = `[24/06/2026, 12:15:00] she: hello
[24/06/2026, 14:10:00] you: world`;
  const a = parseWhatsAppMessages(body);
  const b = parseWhatsAppMessages(body);
  assertEquals(a.map((m) => m.id), b.map((m) => m.id));
  assertEquals(a.length, 2);
  assertEquals(a[0].sender, "she");
  assertEquals(a[1].sender, "you");
});

test("buildMessagePromptVersionOptions sort and Open sum", () => {
  const versions = [
    { id: "a", displayName: "A_v1", order: 10 },
    { id: "b", displayName: "B_v1", order: 20 },
    { id: "c", displayName: "C_v1", order: 30 },
  ];
  const opts = buildMessagePromptVersionOptions(versions, { a: 2, b: 0, c: 5 });
  assertEquals(opts[0].label, "Open (7)");
  assertEquals(opts[0].isOpen, true);
  assertEquals(opts[1].label, "C_v1 (5)");
  assertEquals(opts[2].label, "A_v1 (2)");
  assertEquals(opts[3].label, "B_v1 (0)");
});

test("Open sum ignores zeros", () => {
  const opts = buildMessagePromptVersionOptions(
    [{ id: "a", displayName: "A", order: 1 }],
    { a: 0 }
  );
  assertEquals(opts[0].label, "Open (0)");
  assertEquals(opts[0].count, 0);
});

test("analysisContextMessageIds for she streak", () => {
  const msgs = parseWhatsAppMessages(`[24/06/2026, 12:00:00] you: hi
[24/06/2026, 12:01:00] she: a
[24/06/2026, 12:02:00] she: b
[24/06/2026, 12:03:00] she: c`);
  const target = msgs[3].id;
  const framed = analysisContextMessageIds(msgs, target);
  assertEquals(framed, [msgs[1].id, msgs[2].id, msgs[3].id]);
});

test("analysisContextMessageIds for you after she streak", () => {
  const msgs = parseWhatsAppMessages(`[24/06/2026, 12:00:00] she: a
[24/06/2026, 12:01:00] she: b
[24/06/2026, 12:02:00] you: reply`);
  const framed = analysisContextMessageIds(msgs, msgs[2].id);
  assertEquals(framed, [msgs[0].id, msgs[1].id, msgs[2].id]);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
