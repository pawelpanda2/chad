/**
 * Story 124 — license commerce + real/test payment isolation on real QNAP Postgres.
 * Mutates only test2/test3 payment/licensee rows; never pawel_f.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import type { PoolClient } from "pg";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
dotenv.config({ path: path.join(REPO_ROOT, ".env.local") });
dotenv.config({ path: path.join(REPO_ROOT, ".env.qnap"), override: true });

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import yaml from "js-yaml";
import { QNAP_TAILSCALE_HOST, QNAP_POSTGRES_PORT } from "./dev-db-hosts.js";
import { withPostgresClient, closePostgresConnection } from "./postgres.js";
import { runWithRepoContext } from "./repo-context.js";
import { getUsersListBody } from "./admin-users.js";
import { TEST3_REPO_GUID, TEST3_USERNAME } from "./testing/test3-guard.js";
import { getPaymentsForUser, getTestPaymentsForUser } from "./payments.js";
import {
  LicenseCommerceError,
  buildLicensePlanForUserCount,
  confirmPurchaseEmailOtp,
  createLicenseAcceptance,
  declarationText,
  formatUserCountLabel,
  getLicenseeProfileForCurrentUser,
  getPurchaseVerificationForPlan,
  isBusinessProfileComplete,
  LICENSE_UNIT_PRICE_MINOR,
  requestPurchaseEmailOtp,
  saveLicenseeProfile,
  sha256Hex,
} from "./license-commerce.js";

const pgUser = process.env.POSTGRES_USER || "chad";
const pgPass = process.env.POSTGRES_QNAP_PASSWORD || process.env.POSTGRES_PASSWORD;
const pgDb = process.env.POSTGRES_DB || "chad";
if (pgPass) {
  process.env.POSTGRES_URI = `postgres://${encodeURIComponent(pgUser)}:${encodeURIComponent(pgPass)}@${QNAP_TAILSCALE_HOST}:${QNAP_POSTGRES_PORT}/${pgDb}`;
}
process.env.DBA_PRIMARY_BACKEND = "postgres";
process.env.DBA_POSTGRES_ENABLED = "true";
process.env.DBA_MONGO_ENABLED = "false";
process.env.DBA_CONTENT_PROVIDER_ENABLED = "false";
process.env.CHAD_ENVIRONMENT = "local";

const TEST2_USERNAME = "test2";
const PLAN_1U = "chad-dashboard-1u";
const PLAN_2U = "chad-dashboard-2u";

async function resolveRepoGuidByUsername(username: string): Promise<string> {
  const body = await getUsersListBody();
  if (!body) throw new Error("users-list item not found");
  const parsed = yaml.load(body) as { users?: Array<{ repoGuid?: string; username?: string }> };
  const match = parsed.users?.find((u) => u.username?.toLowerCase() === username.toLowerCase());
  if (!match?.repoGuid) throw new Error(`"${username}" not found`);
  return match.repoGuid;
}

async function applyMigrationIfMissing(client: PoolClient, regclass: string, file: string): Promise<void> {
  const { rows } = await client.query("SELECT to_regclass($1) AS reg", [regclass]);
  if (rows[0].reg) return;
  const sqlPath = path.join(REPO_ROOT, "packages", "dba", "sql", "migrations", file);
  const sql = await readFile(sqlPath, "utf8");
  await client.query(sql);
}

async function applyMigration0008(client: PoolClient): Promise<void> {
  const { rows } = await client.query("SELECT to_regclass('cp_purchase_email_verifications') AS reg");
  if (rows[0].reg) return;
  const sqlPath = path.join(REPO_ROOT, "packages", "dba", "sql", "migrations", "0008_payments_phase2.sql");
  const sql = await readFile(sqlPath, "utf8");
  await client.query(sql);
}

let test2RepoGuid: string;
const createdPaymentIds: string[] = [];
const createdAcceptanceIds: string[] = [];

beforeAll(async () => {
  await withPostgresClient(async (client) => {
    await applyMigrationIfMissing(client, "cp_stripe_payments", "0005_stripe_payments.sql");
    await applyMigrationIfMissing(client, "cp_stripe_payment_events", "0006_stripe_payment_diagnostics.sql");
    await applyMigrationIfMissing(client, "cp_license_plans", "0007_license_payments.sql");
    await applyMigration0008(client);
  });
  test2RepoGuid = await resolveRepoGuidByUsername(TEST2_USERNAME);
});

afterAll(async () => {
  if (createdPaymentIds.length > 0) {
    await withPostgresClient((client) =>
      client.query(`DELETE FROM cp_stripe_payments WHERE id = ANY($1::text[])`, [createdPaymentIds]),
    );
  }
  if (createdAcceptanceIds.length > 0) {
    await withPostgresClient((client) =>
      client.query(`DELETE FROM cp_license_acceptances WHERE id = ANY($1::text[])`, [createdAcceptanceIds]),
    );
  }
  await withPostgresClient((client) =>
    client.query(`DELETE FROM cp_purchase_email_verifications WHERE repo_guid = ANY($1::text[])`, [
      [test2RepoGuid, TEST3_REPO_GUID],
    ]),
  );
  await withPostgresClient((client) =>
    client.query(`DELETE FROM cp_licensee_profiles WHERE repo_guid = ANY($1::text[])`, [
      [test2RepoGuid, TEST3_REPO_GUID],
    ]),
  );
  await closePostgresConnection();
});

describe("declarationText", () => {
  it("uses singular user and for 1 month", () => {
    const one = declarationText({
      legalBusinessName: "Example LLC",
      agreementVersion: "1.0-DRAFT",
      productName: "CHAD Dashboard",
      userCount: 1,
      amountMinor: 79000,
      currency: "PLN",
    });
    expect(one).toContain("1 user");
    expect(one).toContain("for 1 month");
    expect(one).not.toContain("12 months");

    const two = declarationText({
      legalBusinessName: "Example LLC",
      agreementVersion: "1.0-DRAFT",
      productName: "CHAD Dashboard",
      userCount: 2,
      amountMinor: 158000,
      currency: "PLN",
    });
    expect(two).toContain("2 users");
    expect(formatUserCountLabel(2)).toBe("2 users");
  });
});

describe("license commerce (real Postgres, test2/test3)", () => {
  it("builds server-side quotes for 1–99 users at 790 PLN per user", () => {
    const one = buildLicensePlanForUserCount(1);
    expect(one.amountMinor).toBe(LICENSE_UNIT_PRICE_MINOR);
    expect(one.licensePeriod).toBe("1 month");
    expect(one.licensePeriodMonths).toBe(1);

    const twelve = buildLicensePlanForUserCount(12);
    expect(twelve.amountMinor).toBe(12 * LICENSE_UNIT_PRICE_MINOR);
    expect(twelve.id).toBe("chad-dashboard-12u");

    expect(() => buildLicensePlanForUserCount(0)).toThrow(LicenseCommerceError);
    expect(() => buildLicensePlanForUserCount(100)).toThrow(LicenseCommerceError);
  });

  it("verifies account email via purchase OTP", async () => {
    await runWithRepoContext({ repoGuid: test2RepoGuid, username: TEST2_USERNAME }, async () => {
      await saveLicenseeProfile({
        legalBusinessName: "Test Two LLC",
        country: "Poland",
      });
      const otp = await requestPurchaseEmailOtp(PLAN_1U);
      expect(otp.localDevCode).toMatch(/^\d{6}$/);
      const verification = await confirmPurchaseEmailOtp(PLAN_1U, otp.localDevCode);
      expect(verification.verifiedAt).toBeTruthy();
      const status = await getPurchaseVerificationForPlan(PLAN_1U);
      expect(status?.verifiedAt).toBeTruthy();
    });
  });

  it("creates an immutable acceptance snapshot and hashes it", async () => {
    const { acceptance } = await runWithRepoContext({ repoGuid: test2RepoGuid, username: TEST2_USERNAME }, () =>
      createLicenseAcceptance({ planId: PLAN_1U, paymentMethod: "stripe" }),
    );
    createdAcceptanceIds.push(acceptance.id);
    expect(acceptance.snapshot.amountMinor).toBe(79000);
    expect(acceptance.snapshot.userCount).toBe(1);
    expect(acceptance.snapshot.licensePeriodMonths).toBe(1);
    expect(acceptance.snapshotSha256).toBe(sha256Hex(JSON.stringify(acceptance.snapshot)));
    expect(acceptance.snapshot.accountRepoGuid).toBe(test2RepoGuid);
    expect(acceptance.snapshot.verifiedEmail).toBeTruthy();
  });

  it("blocks acceptance without verification", async () => {
    await runWithRepoContext({ repoGuid: TEST3_REPO_GUID, username: TEST3_USERNAME }, async () => {
      const profile = await saveLicenseeProfile({
        legalBusinessName: "Test Three LLC",
        country: "Poland",
      });
      expect(isBusinessProfileComplete(profile)).toBe(true);
      await expect(createLicenseAcceptance({ planId: PLAN_1U })).rejects.toMatchObject({
        code: "not_verified",
      });
    });
  });

  it("admin_test payment is visible only to that user and never in LIVE history", async () => {
    const testId = `test_isolation_${Date.now()}`;
    await withPostgresClient((client) =>
      client.query(
        `INSERT INTO cp_stripe_payments (
           id, repo_guid, username, amount_minor, currency, status, livemode, stripe_mode, chad_environment,
           kind, provider
         ) VALUES ($1,$2,$3,3000,'PLN','completed', false, 'test', 'local', 'admin_test', 'stripe')`,
        [testId, test2RepoGuid, TEST2_USERNAME],
      ),
    );
    createdPaymentIds.push(testId);

    const asOwner = await runWithRepoContext({ repoGuid: test2RepoGuid, username: TEST2_USERNAME }, async () => ({
      live: await getPaymentsForUser(50),
      test: await getTestPaymentsForUser(50),
    }));
    expect(asOwner.live.some((p) => p.id === testId)).toBe(false);
    expect(asOwner.test.some((p) => p.id === testId)).toBe(true);
    expect(asOwner.test.find((p) => p.id === testId)?.kind).toBe("admin_test");

    const asOther = await runWithRepoContext({ repoGuid: TEST3_REPO_GUID, username: TEST3_USERNAME }, async () => ({
      live: await getPaymentsForUser(50),
      test: await getTestPaymentsForUser(50),
    }));
    expect(asOther.live.some((p) => p.id === testId)).toBe(false);
    expect(asOther.test.some((p) => p.id === testId)).toBe(false);
  });

  it("blocks checkout when company is missing", async () => {
    await withPostgresClient((client) =>
      client.query(`DELETE FROM cp_licensee_profiles WHERE repo_guid = $1`, [TEST3_REPO_GUID]),
    );
    await runWithRepoContext({ repoGuid: TEST3_REPO_GUID, username: TEST3_USERNAME }, async () => {
      await expect(requestPurchaseEmailOtp(PLAN_1U)).rejects.toMatchObject({
        code: "business_incomplete",
      });
    });
  });
});
