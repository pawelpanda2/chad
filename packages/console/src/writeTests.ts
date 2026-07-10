/**
 * Manual tests for YAML field update functions
 */

/**
 * Escapes special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Updates or inserts a YAML field in the body string.
 * Fixed version that properly escapes regex special characters.
 */
function upsertYamlField(body: string, key: string, value: string): string {
  const lines = body.split('\n');
  const escapedKey = escapeRegex(key);
  const fieldRegex = new RegExp(`^${escapedKey}\\s*:`);
  let found = false;

  const newLines = lines.map(line => {
    if (fieldRegex.test(line)) {
      found = true;
      return `${key}: ${value}`;
    }
    return line;
  });

  if (!found) {
    // Add field at the end
    newLines.push(`${key}: ${value}`);
  }

  return newLines.join('\n');
}

/**
 * Gets the value of a specific YAML field from the body.
 */
function getYamlFieldValue(body: string, field: string): string {
  const escapedField = escapeRegex(field);
  const lines = body.split('\n');
  for (const line of lines) {
    const match = line.match(new RegExp(`^${escapedField}\\s*:\\s*(.*)`));
    if (match) {
      return match[1].trim();
    }
  }
  return "";
}

// ============================================
// TESTS
// ============================================

function runTests() {
  console.log("=== Running YAML Update Tests ===\n");
  let passed = 0;
  let failed = 0;

  // Test 1: Update writing-deadline with a date value
  {
    const input = `her-first-msg: true
your-first-message: true
writing-deadline:
priority-today: 1`;

    const expected = `her-first-msg: true
your-first-message: true
writing-deadline: 26-06-18
priority-today: 1`;

    const result = upsertYamlField(input, 'writing-deadline', '26-06-18');

    if (result === expected) {
      console.log("✓ Test 1 PASSED: Update writing-deadline with date");
      passed++;
    } else {
      console.log("✗ Test 1 FAILED: Update writing-deadline with date");
      console.log("  Expected:");
      console.log(`    ${expected.replace(/\n/g, '\n    ')}`);
      console.log("  Got:");
      console.log(`    ${result.replace(/\n/g, '\n    ')}`);
      failed++;
    }
  }

  // Test 2: Update writing-deadline with empty value
  {
    const input = `her-first-msg: true
your-first-message: true
writing-deadline: 26-06-18
priority-today: 1`;

    const expected = `her-first-msg: true
your-first-message: true
writing-deadline: 
priority-today: 1`;

    const result = upsertYamlField(input, 'writing-deadline', '');

    if (result === expected) {
      console.log("✓ Test 2 PASSED: Update writing-deadline with empty value");
      passed++;
    } else {
      console.log("✗ Test 2 FAILED: Update writing-deadline with empty value");
      console.log("  Expected:");
      console.log(`    ${expected.replace(/\n/g, '\n    ')}`);
      console.log("  Got:");
      console.log(`    ${result.replace(/\n/g, '\n    ')}`);
      failed++;
    }
  }

  // Test 3: Insert new field that doesn't exist
  {
    const input = `her-first-msg: true
your-first-message: true
priority-today: 1`;

    const expected = `her-first-msg: true
your-first-message: true
priority-today: 1
writing-deadline: 26-06-18`;

    const result = upsertYamlField(input, 'writing-deadline', '26-06-18');

    if (result === expected) {
      console.log("✓ Test 3 PASSED: Insert new field");
      passed++;
    } else {
      console.log("✗ Test 3 FAILED: Insert new field");
      console.log("  Expected:");
      console.log(`    ${expected.replace(/\n/g, '\n    ')}`);
      console.log("  Got:");
      console.log(`    ${result.replace(/\n/g, '\n    ')}`);
      failed++;
    }
  }

  // Test 4: Update her-first-msg field
  {
    const input = `her-first-msg: false
your-first-message: true
writing-deadline: 26-06-18
priority-today: 1`;

    const expected = `her-first-msg: true
your-first-message: true
writing-deadline: 26-06-18
priority-today: 1`;

    const result = upsertYamlField(input, 'her-first-msg', 'true');

    if (result === expected) {
      console.log("✓ Test 4 PASSED: Update her-first-msg field");
      passed++;
    } else {
      console.log("✗ Test 4 FAILED: Update her-first-msg field");
      console.log("  Expected:");
      console.log(`    ${expected.replace(/\n/g, '\n    ')}`);
      console.log("  Got:");
      console.log(`    ${result.replace(/\n/g, '\n    ')}`);
      failed++;
    }
  }

  // Test 5: Get field value from YAML body
  {
    const body = `her-first-msg: true
your-first-message: false
writing-deadline: 26-06-18
priority-today: 1`;

    const tests = [
      { field: 'her-first-msg', expected: 'true' },
      { field: 'your-first-message', expected: 'false' },
      { field: 'writing-deadline', expected: '26-06-18' },
      { field: 'priority-today', expected: '1' },
      { field: 'nonexistent', expected: '' },
    ];

    for (const t of tests) {
      const result = getYamlFieldValue(body, t.field);
      if (result === t.expected) {
        console.log(`✓ Test 5 PASSED: Get field '${t.field}' = '${t.expected}'`);
        passed++;
      } else {
        console.log(`✗ Test 5 FAILED: Get field '${t.field}'`);
        console.log(`  Expected: '${t.expected}'`);
        console.log(`  Got: '${result}'`);
        failed++;
      }
    }
  }

  // Test 6: Get field value with empty value
  {
    const body = `her-first-msg: true
writing-deadline:
priority-today: 1`;

    const result = getYamlFieldValue(body, 'writing-deadline');
    if (result === '') {
      console.log("✓ Test 6 PASSED: Get field with empty value");
      passed++;
    } else {
      console.log("✗ Test 6 FAILED: Get field with empty value");
      console.log(`  Expected: ''`);
      console.log(`  Got: '${result}'`);
      failed++;
    }
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
}

// Export for use in other modules
export { upsertYamlField, getYamlFieldValue, escapeRegex };

// Run tests if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests();
}