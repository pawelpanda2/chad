/**
 * Headers Parser Tests
 * 
 * Tests for the headers format parser.
 */

import { parseHeadersFormat, getBadgeLabel, getTypeColorClass, hasBadge } from './headers-parser.js';

// ============================================================================
// Test Cases
// ============================================================================

function runTests() {
  console.log('Running Headers Parser Tests...\n');
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
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`${message || 'Assertion failed'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
  }

  // Test 1: Parse simple header
  test('Parse simple header', () => {
    const result = parseHeadersFormat('// My Header');
    assertEquals(result.nodes.length, 1);
    assertEquals(result.nodes[0].type, 'header');
    assertEquals(result.nodes[0].content, 'My Header');
    assertEquals(result.nodes[0].level, 0);
  });

  // Test 2: Parse numbered header
  test('Parse numbered header', () => {
    const result = parseHeadersFormat('//1; First Item');
    assertEquals(result.nodes.length, 1);
    assertEquals(result.nodes[0].type, 'header');
    assertEquals(result.nodes[0].content, 'First Item');
    assertEquals(result.nodes[0].headerNumber, 1);
  });

  // Test 3: Parse TODO item
  test('Parse TODO item', () => {
    const result = parseHeadersFormat('t; Task to do');
    assertEquals(result.nodes.length, 1);
    assertEquals(result.nodes[0].type, 'todo');
    assertEquals(result.nodes[0].content, 'Task to do');
  });

  // Test 4: Parse DONE item
  test('Parse DONE item', () => {
    const result = parseHeadersFormat('d; Completed task');
    assertEquals(result.nodes.length, 1);
    assertEquals(result.nodes[0].type, 'done');
    assertEquals(result.nodes[0].content, 'Completed task');
  });

  // Test 5: Parse note
  test('Parse note', () => {
    const result = parseHeadersFormat('- Important note');
    assertEquals(result.nodes.length, 1);
    assertEquals(result.nodes[0].type, 'note');
    assertEquals(result.nodes[0].content, 'Important note');
  });

  // Test 6: Parse regular text
  test('Parse regular text', () => {
    const result = parseHeadersFormat('03/06/44/02/09; data reference');
    assertEquals(result.nodes.length, 1);
    assertEquals(result.nodes[0].type, 'text');
    assertEquals(result.nodes[0].content, '03/06/44/02/09; data reference');
  });

  // Test 7: Parse indented content
  test('Parse indented content with tabs', () => {
    const result = parseHeadersFormat('\t\tIndented content');
    assertEquals(result.nodes.length, 1);
    assertEquals(result.nodes[0].level, 2);
    assertEquals(result.nodes[0].content, 'Indented content');
  });

  // Test 8: Parse complex structure
  test('Parse complex structure', () => {
    const input = `//sorted
\t//1; obowiązkowo nowe
\t\tt; Daria
\t\td; Aga
\t\t03/06/44/02/09; data
\t\t- ważne kontynuacje`;

    const result = parseHeadersFormat(input);
    assertEquals(result.nodes.length, 6);
    assertEquals(result.nodes[0].type, 'header');
    assertEquals(result.nodes[0].content, 'sorted');
    assertEquals(result.nodes[0].level, 0);

    assertEquals(result.nodes[1].type, 'header');
    assertEquals(result.nodes[1].content, 'obowiązkowo nowe');
    assertEquals(result.nodes[1].headerNumber, 1);
    assertEquals(result.nodes[1].level, 1);

    assertEquals(result.nodes[2].type, 'todo');
    assertEquals(result.nodes[2].content, 'Daria');
    assertEquals(result.nodes[2].level, 2);

    assertEquals(result.nodes[3].type, 'done');
    assertEquals(result.nodes[3].content, 'Aga');
    assertEquals(result.nodes[3].level, 2);

    assertEquals(result.nodes[4].type, 'text');
    assertEquals(result.nodes[4].content, '03/06/44/02/09; data');
    assertEquals(result.nodes[4].level, 2);

    assertEquals(result.nodes[5].type, 'note');
    assertEquals(result.nodes[5].content, 'ważne kontynuacje');
    assertEquals(result.nodes[5].level, 2);
  });

  // Test 9: Skip empty lines
  test('Skip empty lines', () => {
    const result = parseHeadersFormat('Line 1\n\n\nLine 2');
    assertEquals(result.nodes.length, 2);
    assertEquals(result.nodes[0].content, 'Line 1');
    assertEquals(result.nodes[1].content, 'Line 2');
  });

  // Test 10: Utility function - getBadgeLabel
  test('Utility: getBadgeLabel', () => {
    assertEquals(getBadgeLabel('todo'), 't');
    assertEquals(getBadgeLabel('done'), 'd');
    assertEquals(getBadgeLabel('header'), null);
    assertEquals(getBadgeLabel('note'), null);
    assertEquals(getBadgeLabel('text'), null);
  });

  // Test 11: Utility function - hasBadge
  test('Utility: hasBadge', () => {
    assertEquals(hasBadge('todo'), true);
    assertEquals(hasBadge('done'), true);
    assertEquals(hasBadge('header'), false);
    assertEquals(hasBadge('note'), false);
    assertEquals(hasBadge('text'), false);
  });

  // Test 12: Utility function - getTypeColorClass
  test('Utility: getTypeColorClass', () => {
    assertEquals(getTypeColorClass('header'), 'text-primary font-semibold');
    assertEquals(getTypeColorClass('todo'), 'text-red-600 dark:text-red-500');
    assertEquals(getTypeColorClass('done'), 'text-green-600 dark:text-green-500');
    assertEquals(getTypeColorClass('note'), 'text-blue-600 dark:text-blue-500');
    assertEquals(getTypeColorClass('text'), 'text-muted-foreground');
  });

  // Test 13: Handle \r\n line endings
  test('Handle Windows line endings (\\r\\n)', () => {
    const result = parseHeadersFormat('Line 1\r\nLine 2\r\nLine 3');
    assertEquals(result.nodes.length, 3);
  });

  // Test 14: Header without number
  test('Header without number', () => {
    const result = parseHeadersFormat('// Just a header');
    assertEquals(result.nodes[0].headerNumber, undefined);
  });

  // Summary
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();