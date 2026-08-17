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
import {
  createAdminTestPayment,
  getPaymentsForUser,
  getTestPaymentsForUser,
} from "./payments.js";
import {
  LicenseCommerceError,
  confirmRepresentativeOtp,
  createLicenseAcceptance,
  declarationText,
  getLicenseeProfileForCurrentUser,
  listActiveLicensePlans,
  requestRepresentativeOtp,
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

let test2RepoGuid: string;
const createdPaymentIds: string[] = [];
const createdAcceptanceIds: string[] = [];

beforeAll(async () => {
  await withPostgresClient(async (client) => {
    await applyMigrationIfMissing(client, "cp_stripe_payments", "0005_stripe_payments.sql");
    await applyMigrationIfMissing(client, "cp_stripe_payment_events", "0006_stripe_payment_diagnostics.sql");
    await applyMigrationIfMissing(client, "cp_license_plans", "0007_license_payments.sql");
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
    client.query(`DELETE FROM cp_licensee_email_otp WHERE repo_guid = ANY($1::text[])`, [
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
  it("fills company, version, product, users, period, price, currency", () => {
    const text = declarationText({
      legalBusinessName: "Example LLC",
      agreementVersion: "1.0-DRAFT",
      productName: "CHAD Dashboard",
      userCount: 2,
      licensePeriod: "12 months",
      amountMinor: 160000,
      currency: "PLN",
    });
    expect(text).toContain("Example LLC");
    expect(text).toContain("1.0-DRAFT");
    expect(text).toContain("CHAD Dashboard");
    expect(text).toContain("2 users");
    expect(text).toContain("12 months");
    expect(text).toContain("1600.00 PLN");
  });
});

describe("license commerce (real Postgres, test2/test3)", () => {
  it("lists configurable plans with server-side prices", async () => {
    const plans = await listActiveLicensePlans();
    expect(plans.length).toBeGreaterThanOrEqual(3);
    const two = plans.find((p) => p.userCount === 2);
    expect(two?.amountMinor).toBe(160000);
    expect(two?.currency).toBe("PLN");
    expect(two?.territory).toBe("Poland");
  });

  it("verifies representative once via OTP and reuses verified_at", async () => {
    const profile = await runWithRepoContext({ repoGuid: test2RepoGuid, username: TEST2_USERNAME }, async () => {
      await saveLicenseeProfile({
        legalBusinessName: "Test Two LLC",
        country: "Poland",
        representativeFullName: "Test Two",
        representativeEmail: "test2-license@example.invalid",
      });
      const otp = await requestRepresentativeOtp();
      expect(otp.localDevCode).toMatch(/^\d{6}$/);
      return confirmRepresentativeOtp(otp.localDevCode);
    });
    expect(profile.verifiedAt).toBeTruthy();

    const again = await runWithRepoContext({ repoGuid: test2RepoGuid, username: TEST2_USERNAME }, () =>
      getLicenseeProfileForCurrentUser(),
    );
    expect(again?.verifiedAt).toBeTruthy();
    expect(new Date(again!.verifiedAt!).getTime()).toBe(new Date(profile.verifiedAt!).getTime());
  });

  it("creates an immutable acceptance snapshot and hashes it", async () => {
    const { acceptance } = await runWithRepoContext({ repoGuid: test2RepoGuid, username: TEST2_USERNAME }, () =>
      createLicenseAcceptance({ planId: "chad-dashboard-2u" }),
    );
    createdAcceptanceIds.push(acceptance.id);
    expect(acceptance.snapshot.amountMinor).toBe(160000);
    expect(acceptance.snapshot.userCount).toBe(2);
    expect(acceptance.snapshotSha256).toBe(sha256Hex(JSON.stringify(acceptance.snapshot)));
    expect(acceptance.snapshot.accountRepoGuid).toBe(test2RepoGuid);
    expect(acceptance.snapshot.accountUsername).toBe(TEST2_USERNAME);
  });

  it("blocks acceptance without verification", async () => {
    await runWithRepoContext({ repoGuid: TEST3_REPO_GUID, username: TEST3_USERNAME }, async () => {
      await saveLicenseeProfile({
        legalBusinessName: "Test Three LLC",
        country: "Poland",
        representativeFullName: "Test Three",
        representativeEmail: "test3-license@example.invalid",
      });
      await expect(createLicenseAcceptance({ planId: "chad-dashboard-1u" })).rejects.toMatchObject({
        code: "not_verified",
      });
    });
  });

  it("admin TEST payment is visible only to that user and never in real history", async () => {
    const created = await runWithRepoContext({ repoGuid: test2RepoGuid, username: TEST2_USERNAME }, () =>
      createAdminTestPayment({ targetRepoGuid: test2RepoGuid, planId: "chad-dashboard-3u" }),
    );
    createdPaymentIds.push(created.id);
    expect(created.kind).toBe("test");
    expect(created.provider).toBe("admin_test");
    expect(created.licenseActivatedAt).toBeNull();
    expect(created.amountMinor).toBe(240000);

    const asOwner = await runWithRepoContext({ repoGuid: test2RepoGuid, username: TEST2_USERNAME }, async () => ({
      real: await getPaymentsForUser(50),
      test: await getTestPaymentsForUser(50),
    }));
    expect(asOwner.real.some((p) => p.id === created.id)).toBe(false);
    expect(asOwner.test.some((p) => p.id === created.id)).toBe(true);

    const asOther = await runWithRepoContext({ repoGuid: TEST3_REPO_GUID, username: TEST3_USERNAME }, async () => ({
      real: await getPaymentsForUser(50),
      test: await getTestPaymentsForUser(50),
    }));
    expect(asOther.real.some((p) => p.id === created.id)).toBe(false);
    expect(asOther.test.some((p) => p.id === created.id)).toBe(false);
  });

  it("rejects unknown admin target users", async () => {
    await expect(
      runWithRepoContext({ repoGuid: test2RepoGuid, username: TEST2_USERNAME }, () =>
        createAdminTestPayment({
          targetRepoGuid: "00000000-0000-0000-0000-000000000000",
          planId: "chad-dashboard-1u",
        }),
      ),
    ).rejects.toBeInstanceOf(LicenseCommerceError);
  });
});
