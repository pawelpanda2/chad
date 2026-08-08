/**
 * Static layering-boundary check for the ZIP Folder import feature (Story
 * 109) — see ai-docs/content-provider/ai-start.md. Extends the existing
 * convention (packages/mcp/src/no-direct-provider-access.test.ts) rather
 * than adding new dependency-lint tooling.
 *
 * Asserts:
 * - The Dashboard's Folders route/page files never import a `cp-*`
 *   package directly — only `dba`.
 * - `dba`'s own cp-import.ts never imports `cp-files`/`cp-postgre`/
 *   `cp-mongo`/`cp-net-adapter` directly — only `cp-entry`/`cp-core`.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..", "..");

const CP_PACKAGE_IMPORT_PATTERN = /from\s+["'](cp-core|cp-entry|cp-files|cp-postgre|cp-mongo|cp-net-adapter)["']/;

const DASHBOARD_FOLDERS_FILES = [
  "packages/dashboard/app/api/folders/route.ts",
  "packages/dashboard/app/api/folders/config/route.ts",
  "packages/dashboard/app/api/folders/export/route.ts",
  "packages/dashboard/app/api/folders/repos/route.ts",
  "packages/dashboard/app/api/folders/import/route.ts",
  "packages/dashboard/app/(dashboard)/dashboard/folders/page.tsx",
  "packages/dashboard/lib/folders-api.ts",
];

describe("ZIP import layering boundary", () => {
  it.each(DASHBOARD_FOLDERS_FILES)("%s never imports a cp-* package directly (only dba)", (relPath) => {
    const content = readFileSync(join(repoRoot, relPath), "utf8");
    expect(CP_PACKAGE_IMPORT_PATTERN.test(content), `${relPath} imports a cp-* package directly`).toBe(false);
  });

  it("dba's cp-import.ts never imports cp-files/cp-postgre/cp-mongo/cp-net-adapter directly (only cp-entry/cp-core)", () => {
    const content = readFileSync(join(__dirname, "cp-import.ts"), "utf8");
    const forbidden = /from\s+["'](cp-files|cp-postgre|cp-mongo|cp-net-adapter)["']/;
    expect(forbidden.test(content), "cp-import.ts bypasses cp-entry").toBe(false);
    expect(/from\s+["']cp-entry["']/.test(content)).toBe(true);
  });

  it("cp-files' zip-import.ts contains no SQL (SQL belongs only to a provider package)", () => {
    const content = readFileSync(join(repoRoot, "packages/content-provider/files/src/zip-import.ts"), "utf8");
    expect(/\bSELECT\b|\bINSERT\s+INTO\b|\bUPDATE\s+cp_items\b/i.test(content)).toBe(false);
  });

  it("cp-core's import.ts (DTOs) contains no fs/zip-specific implementation", () => {
    const content = readFileSync(join(repoRoot, "packages/content-provider/common/src/import.ts"), "utf8");
    expect(/from\s+["']node:fs|from\s+["']yauzl["']|from\s+["']yaml["']/.test(content)).toBe(false);
  });
});
