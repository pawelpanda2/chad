/**
 * Story 124 — license plans, licensee profile, one-time representative
 * verification, and immutable License Agreement acceptances.
 *
 * Payments themselves stay in payments.ts. This module never talks to Stripe.
 */
import { createHash, randomInt, randomUUID } from "node:crypto";
import { withPostgresClient } from "./postgres.js";
import { getCurrentRepoGuid, getCurrentUsername } from "./repo-context.js";
import { getUsersListBody } from "./admin-users.js";
import yaml from "js-yaml";

export class LicenseCommerceError extends Error {
  constructor(
    public readonly code:
      | "plan_not_found"
      | "plan_inactive"
      | "profile_required"
      | "not_verified"
      | "otp_invalid"
      | "otp_expired"
      | "acceptance_not_found"
      | "acceptance_mismatch"
      | "user_not_found"
      | "provider_unavailable",
    message: string,
  ) {
    super(message);
    this.name = "LicenseCommerceError";
  }
}

export interface LicensePlan {
  id: string;
  productName: string;
  productVersion: string;
  userCount: number;
  amountMinor: number;
  currency: string;
  licensePeriod: string;
  territory: string;
  active: boolean;
}

export interface LicenseeProfile {
  repoGuid: string;
  legalBusinessName: string;
  country: string;
  state: string | null;
  filingId: string | null;
  businessAddress: string | null;
  representativeFullName: string;
  representativeEmail: string;
  verifiedAt: string | null;
}

export interface LicenseAgreementVersion {
  version: string;
  title: string;
  body: string;
  bodySha256: string;
  draft: boolean;
}

export interface LicenseAcceptance {
  id: string;
  repoGuid: string;
  username: string;
  planId: string;
  agreementVersion: string;
  agreementSha256: string;
  snapshot: LicenseAcceptanceSnapshot;
  snapshotSha256: string;
  acceptedAt: string;
}

export interface LicenseAcceptanceSnapshot {
  agreementVersion: string;
  agreementSha256: string;
  agreementTitle: string;
  agreementBody: string;
  productName: string;
  productVersion: string;
  planId: string;
  userCount: number;
  licensePeriod: string;
  territory: string;
  amountMinor: number;
  currency: string;
  legalBusinessName: string;
  country: string;
  state: string | null;
  filingId: string | null;
  businessAddress: string | null;
  representativeFullName: string;
  representativeEmail: string;
  verifiedAt: string;
  accountUsername: string;
  accountRepoGuid: string;
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function declarationText(snapshot: Pick<
  LicenseAcceptanceSnapshot,
  "legalBusinessName" | "agreementVersion" | "productName" | "userCount" | "licensePeriod" | "amountMinor" | "currency"
>): string {
  const price = (snapshot.amountMinor / 100).toFixed(2);
  return `I declare that I am authorized to act on behalf of ${snapshot.legalBusinessName} and, on its behalf, accept License Agreement ${snapshot.agreementVersion} for ${snapshot.productName}, covering ${snapshot.userCount} users for ${snapshot.licensePeriod}, for a license fee of ${price} ${snapshot.currency}.`;
}

export async function listActiveLicensePlans(): Promise<LicensePlan[]> {
  return withPostgresClient(async (client) => {
    const { rows } = await client.query<{
      id: string;
      product_name: string;
      product_version: string;
      user_count: number;
      amount_minor: string;
      currency: string;
      license_period: string;
      territory: string;
      active: boolean;
    }>(
      `SELECT id, product_name, product_version, user_count, amount_minor, currency,
              license_period, territory, active
       FROM cp_license_plans
       WHERE active = true
       ORDER BY user_count ASC`,
    );
    return rows.map(mapPlan);
  });
}

export async function getLicensePlan(planId: string): Promise<LicensePlan> {
  return withPostgresClient(async (client) => {
    const { rows } = await client.query<{
      id: string;
      product_name: string;
      product_version: string;
      user_count: number;
      amount_minor: string;
      currency: string;
      license_period: string;
      territory: string;
      active: boolean;
    }>(
      `SELECT id, product_name, product_version, user_count, amount_minor, currency,
              license_period, territory, active
       FROM cp_license_plans
       WHERE id = $1
       LIMIT 1`,
      [planId],
    );
    if (rows.length === 0) {
      throw new LicenseCommerceError("plan_not_found", "License plan not found.");
    }
    return mapPlan(rows[0]);
  });
}

function mapPlan(r: {
  id: string;
  product_name: string;
  product_version: string;
  user_count: number;
  amount_minor: string;
  currency: string;
  license_period: string;
  territory: string;
  active: boolean;
}): LicensePlan {
  return {
    id: r.id,
    productName: r.product_name,
    productVersion: r.product_version,
    userCount: Number(r.user_count),
    amountMinor: Number(r.amount_minor),
    currency: r.currency,
    licensePeriod: r.license_period,
    territory: r.territory,
    active: r.active,
  };
}

export async function getCurrentLicenseAgreement(): Promise<LicenseAgreementVersion> {
  return withPostgresClient(async (client) => {
    const { rows } = await client.query<{
      version: string;
      title: string;
      body: string;
      body_sha256: string;
      draft: boolean;
    }>(
      `SELECT version, title, body, body_sha256, draft
       FROM cp_license_agreement_versions
       ORDER BY published_at DESC
       LIMIT 1`,
    );
    if (rows.length === 0) {
      throw new LicenseCommerceError("acceptance_not_found", "No License Agreement version is published.");
    }
    const row = rows[0];
    return {
      version: row.version,
      title: row.title,
      body: row.body,
      bodySha256: row.body_sha256,
      draft: row.draft,
    };
  });
}

export async function getLicenseeProfileForCurrentUser(): Promise<LicenseeProfile | null> {
  const repoGuid = getCurrentRepoGuid();
  return getLicenseeProfileByRepoGuid(repoGuid);
}

export async function getLicenseeProfileByRepoGuid(repoGuid: string): Promise<LicenseeProfile | null> {
  return withPostgresClient(async (client) => {
    const { rows } = await client.query<{
      repo_guid: string;
      legal_business_name: string;
      country: string;
      state: string | null;
      filing_id: string | null;
      business_address: string | null;
      representative_full_name: string;
      representative_email: string;
      verified_at: string | null;
    }>(
      `SELECT repo_guid, legal_business_name, country, state, filing_id, business_address,
              representative_full_name, representative_email, verified_at
       FROM cp_licensee_profiles
       WHERE repo_guid = $1
       LIMIT 1`,
      [repoGuid],
    );
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      repoGuid: r.repo_guid,
      legalBusinessName: r.legal_business_name,
      country: r.country,
      state: r.state,
      filingId: r.filing_id,
      businessAddress: r.business_address,
      representativeFullName: r.representative_full_name,
      representativeEmail: r.representative_email,
      verifiedAt: r.verified_at,
    };
  });
}

export interface SaveLicenseeProfileInput {
  legalBusinessName: string;
  country: string;
  state?: string | null;
  filingId?: string | null;
  businessAddress?: string | null;
  representativeFullName: string;
  representativeEmail: string;
}

function requireNonEmpty(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new LicenseCommerceError("profile_required", `${label} is required.`);
  }
  return value.trim();
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export async function saveLicenseeProfile(input: SaveLicenseeProfileInput): Promise<LicenseeProfile> {
  const repoGuid = getCurrentRepoGuid();
  const legalBusinessName = requireNonEmpty(input.legalBusinessName, "Legal business name");
  const country = requireNonEmpty(input.country, "Country");
  const representativeFullName = requireNonEmpty(input.representativeFullName, "Representative name");
  const representativeEmail = normalizeEmail(requireNonEmpty(input.representativeEmail, "Representative email"));
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(representativeEmail)) {
    throw new LicenseCommerceError("profile_required", "Representative email is invalid.");
  }

  const existing = await getLicenseeProfileByRepoGuid(repoGuid);
  const emailChanged = !existing || existing.representativeEmail.toLowerCase() !== representativeEmail;

  return withPostgresClient(async (client) => {
    const { rows } = await client.query<{
      repo_guid: string;
      legal_business_name: string;
      country: string;
      state: string | null;
      filing_id: string | null;
      business_address: string | null;
      representative_full_name: string;
      representative_email: string;
      verified_at: string | null;
    }>(
      `INSERT INTO cp_licensee_profiles (
         repo_guid, legal_business_name, country, state, filing_id, business_address,
         representative_full_name, representative_email, verified_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8, CASE WHEN $9 THEN NULL ELSE $10::timestamptz END, now())
       ON CONFLICT (repo_guid) DO UPDATE SET
         legal_business_name = EXCLUDED.legal_business_name,
         country = EXCLUDED.country,
         state = EXCLUDED.state,
         filing_id = EXCLUDED.filing_id,
         business_address = EXCLUDED.business_address,
         representative_full_name = EXCLUDED.representative_full_name,
         representative_email = EXCLUDED.representative_email,
         verified_at = CASE WHEN $9 THEN NULL ELSE cp_licensee_profiles.verified_at END,
         updated_at = now()
       RETURNING repo_guid, legal_business_name, country, state, filing_id, business_address,
                 representative_full_name, representative_email, verified_at`,
      [
        repoGuid,
        legalBusinessName,
        country,
        input.state?.trim() || null,
        input.filingId?.trim() || null,
        input.businessAddress?.trim() || null,
        representativeFullName,
        representativeEmail,
        emailChanged,
        existing?.verifiedAt ?? null,
      ],
    );
    const r = rows[0];
    return {
      repoGuid: r.repo_guid,
      legalBusinessName: r.legal_business_name,
      country: r.country,
      state: r.state,
      filingId: r.filing_id,
      businessAddress: r.business_address,
      representativeFullName: r.representative_full_name,
      representativeEmail: r.representative_email,
      verifiedAt: r.verified_at,
    };
  });
}

export interface RequestRepresentativeOtpResult {
  email: string;
  expiresAt: string;
  /** Present only in local CHAD — no mailer exists in this repo. */
  localDevCode?: string;
}

export async function requestRepresentativeOtp(): Promise<RequestRepresentativeOtpResult> {
  const repoGuid = getCurrentRepoGuid();
  const profile = await getLicenseeProfileByRepoGuid(repoGuid);
  if (!profile) {
    throw new LicenseCommerceError("profile_required", "Save company and representative details first.");
  }
  const code = String(randomInt(100000, 1000000));
  const codeHash = sha256Hex(code);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  await withPostgresClient((client) =>
    client.query(
      `INSERT INTO cp_licensee_email_otp (repo_guid, email, code_hash, expires_at, attempts)
       VALUES ($1, $2, $3, $4, 0)
       ON CONFLICT (repo_guid) DO UPDATE SET
         email = EXCLUDED.email,
         code_hash = EXCLUDED.code_hash,
         expires_at = EXCLUDED.expires_at,
         attempts = 0,
         created_at = now()`,
      [repoGuid, profile.representativeEmail, codeHash, expiresAt],
    ),
  );

  const result: RequestRepresentativeOtpResult = {
    email: profile.representativeEmail,
    expiresAt,
  };
  if ((process.env.CHAD_ENVIRONMENT || "local") === "local") {
    result.localDevCode = code;
  }
  return result;
}

export async function confirmRepresentativeOtp(code: unknown): Promise<LicenseeProfile> {
  const repoGuid = getCurrentRepoGuid();
  if (typeof code !== "string" || !/^\d{6}$/.test(code.trim())) {
    throw new LicenseCommerceError("otp_invalid", "Enter the 6-digit verification code.");
  }
  const profile = await getLicenseeProfileByRepoGuid(repoGuid);
  if (!profile) {
    throw new LicenseCommerceError("profile_required", "Save company and representative details first.");
  }

  return withPostgresClient(async (client) => {
    const { rows } = await client.query<{
      email: string;
      code_hash: string;
      expires_at: string;
      attempts: number;
    }>(
      `SELECT email, code_hash, expires_at, attempts
       FROM cp_licensee_email_otp
       WHERE repo_guid = $1
       LIMIT 1`,
      [repoGuid],
    );
    if (rows.length === 0) {
      throw new LicenseCommerceError("otp_invalid", "No verification code is pending.");
    }
    const otp = rows[0];
    if (otp.attempts >= 5) {
      throw new LicenseCommerceError("otp_invalid", "Too many attempts — request a new code.");
    }
    if (new Date(otp.expires_at).getTime() < Date.now()) {
      throw new LicenseCommerceError("otp_expired", "Verification code expired — request a new one.");
    }
    if (otp.email !== profile.representativeEmail) {
      throw new LicenseCommerceError("otp_invalid", "Email changed — request a new code.");
    }
    if (otp.code_hash !== sha256Hex(code.trim())) {
      await client.query(
        `UPDATE cp_licensee_email_otp SET attempts = attempts + 1 WHERE repo_guid = $1`,
        [repoGuid],
      );
      throw new LicenseCommerceError("otp_invalid", "Verification code is incorrect.");
    }

    const { rows: updated } = await client.query<{
      repo_guid: string;
      legal_business_name: string;
      country: string;
      state: string | null;
      filing_id: string | null;
      business_address: string | null;
      representative_full_name: string;
      representative_email: string;
      verified_at: string | null;
    }>(
      `UPDATE cp_licensee_profiles
       SET verified_at = now(), updated_at = now()
       WHERE repo_guid = $1
       RETURNING repo_guid, legal_business_name, country, state, filing_id, business_address,
                 representative_full_name, representative_email, verified_at`,
      [repoGuid],
    );
    await client.query(`DELETE FROM cp_licensee_email_otp WHERE repo_guid = $1`, [repoGuid]);
    const r = updated[0];
    return {
      repoGuid: r.repo_guid,
      legalBusinessName: r.legal_business_name,
      country: r.country,
      state: r.state,
      filingId: r.filing_id,
      businessAddress: r.business_address,
      representativeFullName: r.representative_full_name,
      representativeEmail: r.representative_email,
      verifiedAt: r.verified_at,
    };
  });
}

export async function createLicenseAcceptance(input: {
  planId: unknown;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<{ acceptance: LicenseAcceptance; declaration: string }> {
  const repoGuid = getCurrentRepoGuid();
  const username = getCurrentUsername();
  if (typeof input.planId !== "string" || !input.planId.trim()) {
    throw new LicenseCommerceError("plan_not_found", "Select a license plan.");
  }
  const plan = await getLicensePlan(input.planId.trim());
  if (!plan.active) {
    throw new LicenseCommerceError("plan_inactive", "That license plan is not active.");
  }
  const profile = await getLicenseeProfileByRepoGuid(repoGuid);
  if (!profile) {
    throw new LicenseCommerceError("profile_required", "Save company and representative details first.");
  }
  if (!profile.verifiedAt) {
    throw new LicenseCommerceError("not_verified", "Verify the representative email before accepting the license.");
  }
  const agreement = await getCurrentLicenseAgreement();
  const liveHash = sha256Hex(agreement.body);
  if (liveHash !== agreement.bodySha256) {
    throw new LicenseCommerceError("acceptance_mismatch", "License Agreement hash does not match stored body.");
  }

  const snapshot: LicenseAcceptanceSnapshot = {
    agreementVersion: agreement.version,
    agreementSha256: agreement.bodySha256,
    agreementTitle: agreement.title,
    agreementBody: agreement.body,
    productName: plan.productName,
    productVersion: plan.productVersion,
    planId: plan.id,
    userCount: plan.userCount,
    licensePeriod: plan.licensePeriod,
    territory: plan.territory,
    amountMinor: plan.amountMinor,
    currency: plan.currency,
    legalBusinessName: profile.legalBusinessName,
    country: profile.country,
    state: profile.state,
    filingId: profile.filingId,
    businessAddress: profile.businessAddress,
    representativeFullName: profile.representativeFullName,
    representativeEmail: profile.representativeEmail,
    verifiedAt: profile.verifiedAt,
    accountUsername: username,
    accountRepoGuid: repoGuid,
  };
  const snapshotJson = JSON.stringify(snapshot);
  const snapshotSha256 = sha256Hex(snapshotJson);
  const id = randomUUID();

  await withPostgresClient((client) =>
    client.query(
      `INSERT INTO cp_license_acceptances (
         id, repo_guid, username, plan_id, agreement_version, agreement_sha256,
         snapshot, snapshot_sha256, ip, user_agent
       ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10)`,
      [
        id,
        repoGuid,
        username,
        plan.id,
        agreement.version,
        agreement.bodySha256,
        snapshotJson,
        snapshotSha256,
        input.ip ?? null,
        input.userAgent ?? null,
      ],
    ),
  );

  const acceptance: LicenseAcceptance = {
    id,
    repoGuid,
    username,
    planId: plan.id,
    agreementVersion: agreement.version,
    agreementSha256: agreement.bodySha256,
    snapshot,
    snapshotSha256,
    acceptedAt: new Date().toISOString(),
  };
  return { acceptance, declaration: declarationText(snapshot) };
}

export async function getLicenseAcceptanceForCurrentUser(acceptanceId: string): Promise<LicenseAcceptance> {
  const repoGuid = getCurrentRepoGuid();
  return withPostgresClient(async (client) => {
    const { rows } = await client.query<{
      id: string;
      repo_guid: string;
      username: string;
      plan_id: string;
      agreement_version: string;
      agreement_sha256: string;
      snapshot: LicenseAcceptanceSnapshot;
      snapshot_sha256: string;
      accepted_at: string;
    }>(
      `SELECT id, repo_guid, username, plan_id, agreement_version, agreement_sha256,
              snapshot, snapshot_sha256, accepted_at
       FROM cp_license_acceptances
       WHERE id = $1 AND repo_guid = $2
       LIMIT 1`,
      [acceptanceId, repoGuid],
    );
    if (rows.length === 0) {
      throw new LicenseCommerceError("acceptance_not_found", "License acceptance not found.");
    }
    const r = rows[0];
    return {
      id: r.id,
      repoGuid: r.repo_guid,
      username: r.username,
      planId: r.plan_id,
      agreementVersion: r.agreement_version,
      agreementSha256: r.agreement_sha256,
      snapshot: r.snapshot,
      snapshotSha256: r.snapshot_sha256,
      acceptedAt: r.accepted_at,
    };
  });
}

export async function resolveUsernameByRepoGuid(repoGuid: string): Promise<string> {
  const body = await getUsersListBody();
  if (!body) {
    throw new LicenseCommerceError("user_not_found", "users-list not found.");
  }
  const parsed = yaml.load(body) as { users?: Array<{ repoGuid?: string; username?: string }> };
  const match = parsed.users?.find((u) => u.repoGuid === repoGuid);
  if (!match?.username) {
    throw new LicenseCommerceError("user_not_found", "User not found.");
  }
  return match.username;
}
