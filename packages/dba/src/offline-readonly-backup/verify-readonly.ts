import type { PoolClient } from "pg";

export interface ReadonlyVerificationResult {
  ok: boolean;
  checks: Array<{ name: string; passed: boolean; error?: string }>;
}

/** Programmatic read-only verification (used by tests and Dev Panel switch). */
export async function verifyPostgresReadonlyRole(client: PoolClient): Promise<ReadonlyVerificationResult> {
  const checks: ReadonlyVerificationResult["checks"] = [];

  async function runCheck(name: string, sql: string, expectSuccess: boolean): Promise<void> {
    try {
      await client.query(sql);
      checks.push({ name, passed: expectSuccess, error: expectSuccess ? undefined : "write succeeded" });
    } catch (err) {
      checks.push({
        name,
        passed: !expectSuccess,
        error: expectSuccess ? (err instanceof Error ? err.message : String(err)) : undefined,
      });
    }
  }

  await runCheck("SELECT", "SELECT 1", true);
  await runCheck("INSERT", "INSERT INTO cp_items DEFAULT VALUES", false);
  await runCheck("UPDATE", "UPDATE cp_items SET body = body WHERE false", false);
  await runCheck("DELETE", "DELETE FROM cp_items WHERE false", false);
  const tmp = `offline_readonly_backup_verify_${Date.now()}`;
  await runCheck("CREATE TABLE", `CREATE TABLE ${tmp} (id int)`, false);

  return { ok: checks.every((c) => c.passed), checks };
}
