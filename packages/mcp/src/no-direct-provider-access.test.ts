/**
 * Static check backing Input §1.3's "brak bezpośredniego dostępu do
 * providerów" — every `import`/`require` in this package's own source must
 * go through the public `dba` package (or Node/SDK/zod/js-yaml/dotenv
 * built-ins), never a raw DB driver or a `dba` internal provider file
 * directly.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));

const FORBIDDEN_IMPORT_PATTERNS = [
  /from\s+["']pg["']/,
  /from\s+["']mongodb["']/,
  /from\s+["']dba\/data-providers/,
  /from\s+["'].*\/data-providers\//,
  /from\s+["'].*content-provider\/(common|files|mongo|postgre|net-adapter)/,
];

function collectSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist") continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...collectSourceFiles(full));
    } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) {
      out.push(full);
    }
  }
  return out;
}

describe("no direct provider/driver access", () => {
  const files = collectSourceFiles(__dirname);

  it("found at least the expected tool/handler source files (sanity check the scan itself works)", () => {
    expect(files.length).toBeGreaterThan (5);
  });

  it.each(files)("%s imports only through the public dba package, never a raw driver or provider file", (file) => {
    const content = readFileSync(file, "utf8");
    for (const pattern of FORBIDDEN_IMPORT_PATTERNS) {
      expect(pattern.test(content), `${file} matched forbidden pattern ${pattern}`).toBe(false);
    }
  });
});
