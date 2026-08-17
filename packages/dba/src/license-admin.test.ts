/**
 * Admin → Licenses DBA — real Postgres list/detail/PDF context.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import type { PoolClient } from "pg";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { QNAP_TAILSCALE_HOST, QNAP_POSTGRES_PORT } from "./dev-db-hosts.js";
import { withPostgresClient, closePostgresConnection } from "./postgres.js";
import {
  getLicensesForAdmin,
  getLicenseDetailForAdmin,
  getLicenseAgreementPdfForAdmin,
} from "./license-admin.js";
import { LicenseCommerceError, sha256Hex } from "./license-commerce.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
dotenv.config({ path: path.join(REPO_ROOT, ".env.local") });
dotenv.config({ path: path.join(REPO_ROOT, ".env.qnap"), override: true });

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

const ACCEPTANCE_ID = `admin-lic-test-${Date.now()}`;

async function applyMigrationIfMissing(client: PoolClient, regclass: string, file: string): Promise<void> {
  const { rows } = await client.query("SELECT to_regclass($1) AS reg", [regclass]);
  if (rows[0].reg) return;
  const sql = await readFile(path.join(REPO_ROOT, "packages", "dba", "sql", "migrations", file), "utf8");
  await client.query(sql);
}

const snapshot = {
  agreementVersion: "1.0-DRAFT",
  agreementSha256: "testhash",
  agreementTitle: "CHAD DASHBOARD LICENSE AGREEMENT 1.0-DRAFT",
  agreementBody: "Agreement body for admin license test.",
  productName: "CHAD Dashboard",
  productVersion: "1",
  planId: "chad-dashboard-1u",
  userCount: 1,
  licensePeriod: "1 month",
  licensePeriodMonths: 1,
  territory: "Poland",
  amountMinor: 80000,
  currency: "PLN",
  paymentMethod: "stripe",
  legalBusinessName: "Admin Test LLC",
  country: "Poland",
  state: null,
  filingId: null,
  businessAddress: "Test St 1",
  city: "Warsaw",
  postalCode: "00-001",
  businessEmail: null,
  verifiedEmail: "admin-test@example.invalid",
  emailVerifiedAt: "2026-08-17T10:00:00.000Z",
  accountUsername: "test2",
  accountRepoGuid: "repo-test2",
};

beforeAll(async () => {
  await withPostgresClient(async (client) => {
    await applyMigrationIfMissing(client, "cp_license_acceptances", "0007_license_payments.sql");
    await applyMigrationIfMissing(client, "cp_purchase_email_verifications", "0008_payments_phase2.sql");
    const snapshotJson = JSON.stringify(snapshot);
    await client.query(
      `INSERT INTO cp_license_acceptances (
         id, repo_guid, username, plan_id, agreement_version, agreement_sha256,
         snapshot, snapshot_sha256
       ) VALUES ($1,'repo-test2','test2','chad-dashboard-1u','1.0-DRAFT','testhash',$2::jsonb,$3)
       ON CONFLICT (id) DO NOTHING`,
      [ACCEPTANCE_ID, snapshotJson, sha256Hex(snapshotJson)],
    );
    await client.query(
      `INSERT INTO cp_stripe_payments (
         id, repo_guid, username, amount_minor, currency, status, livemode, stripe_mode,
         chad_environment, kind, provider, license_acceptance_id
       ) VALUES ($1,'repo-test2','test2',80000,'PLN','completed',true,'live','local','user_payment','stripe',$2)
       ON CONFLICT (id) DO NOTHING`,
      [`pay_${ACCEPTANCE_ID}`, ACCEPTANCE_ID],
    );
  });
});

afterAll(async () => {
  await withPostgresClient(async (client) => {
    await client.query(`DELETE FROM cp_stripe_payments WHERE license_acceptance_id = $1`, [ACCEPTANCE_ID]);
    await client.query(`DELETE FROM cp_license_acceptances WHERE id = $1`, [ACCEPTANCE_ID]);
  });
  await closePostgresConnection();
});

describe("license-admin (Postgres)", () => {
  it("lists licenses with company/user from snapshot", async () => {
    const list = await getLicensesForAdmin(500);
    const row = list.find((r) => r.id === ACCEPTANCE_ID);
    expect(row).toBeTruthy();
    expect(row?.company).toBe("Admin Test LLC");
    expect(row?.username).toBe("test2");
    expect(row?.userCount).toBe(1);
    expect(row?.licensePeriod).toBe("1 month");
    expect(row?.amountMinor).toBe(80000);
    expect(row?.agreementVersion).toBe("1.0-DRAFT");
  });

  it("returns detail with payment join and logical/pdf hashes", async () => {
    const detail = await getLicenseDetailForAdmin(ACCEPTANCE_ID);
    expect(detail.company).toBe("Admin Test LLC");
    expect(detail.checkoutSessionId).toBe(`pay_${ACCEPTANCE_ID}`);
    expect(detail.paymentKind).toBe("user_payment");
    expect(detail.stripeMode).toBe("live");
    expect(detail.businessSnapshot.legalBusinessName).toBe("Admin Test LLC");
    expect(detail.agreementRecordLogicalHash).toMatch(/^[a-f0-9]{64}$/);
    expect(detail.agreementPdfHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("generates complete PDF from snapshot only", async () => {
    const detail = await getLicenseDetailForAdmin(ACCEPTANCE_ID);
    const { pdf, logicalHash } = await getLicenseAgreementPdfForAdmin(ACCEPTANCE_ID);
    expect(Buffer.from(pdf).subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(800);
    expect(logicalHash).toBe(detail.agreementRecordLogicalHash);
  });

  it("throws not found for missing license", async () => {
    await expect(getLicenseDetailForAdmin("00000000-0000-0000-0000-000000000000")).rejects.toBeInstanceOf(
      LicenseCommerceError,
    );
  });
});
