/**
 * Story 124 — license plans, Account → Business profile, purchase email
 * verification (account identity), and immutable License Agreement acceptances.
 *
 * Payments themselves stay in payments.ts. This module never talks to Stripe.
 */
import { createHash, randomInt, randomUUID } from "node:crypto";
import { withPostgresClient } from "./postgres.js";
import { getCurrentRepoGuid, getCurrentUsername } from "./repo-context.js";
import { getUsersListBody } from "./admin-users.js";
import yaml from "js-yaml";

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_RESEND_MIN_MS = 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;

export class LicenseCommerceError extends Error {
  constructor(
    public readonly code:
      | "plan_not_found"
      | "plan_inactive"
      | "profile_required"
      | "business_incomplete"
      | "not_verified"
      | "otp_invalid"
      | "otp_expired"
      | "acceptance_not_found"
      | "acceptance_mismatch"
      | "user_not_found"
      | "provider_unavailable"
      | "email_not_configured",
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
  licensePeriodMonths: number;
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
  city: string | null;
  postalCode: string | null;
  businessEmail: string | null;
}

export interface PurchaseEmailVerification {
  accountEmail: string;
  verifiedAt: string | null;
  contextHash: string | null;
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
  licensePeriodMonths: number;
  territory: string;
  amountMinor: number;
  currency: string;
  paymentMethod: string;
  legalBusinessName: string;
  country: string;
  state: string | null;
  filingId: string | null;
  businessAddress: string | null;
  city: string | null;
  postalCode: string | null;
  businessEmail: string | null;
  verifiedEmail: string;
  emailVerifiedAt: string;
  accountUsername: string;
  accountRepoGuid: string;
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function formatUserCountLabel(userCount: number): string {
  return userCount === 1 ? "1 user" : `${userCount} users`;
}

export function declarationText(
  snapshot: Pick<
    LicenseAcceptanceSnapshot,
    "legalBusinessName" | "agreementVersion" | "productName" | "userCount" | "amountMinor" | "currency"
  >,
): string {
  const price = (snapshot.amountMinor / 100).toFixed(2);
  const users = formatUserCountLabel(snapshot.userCount);
  return `I declare that I am authorized to act on behalf of ${snapshot.legalBusinessName} and, on its behalf, accept License Agreement ${snapshot.agreementVersion} for ${snapshot.productName}, covering ${users} for 1 month, for a license fee of ${price} ${snapshot.currency}.`;
}

export function isBusinessProfileComplete(profile: LicenseeProfile | null): profile is LicenseeProfile {
  if (!profile) return false;
  return profile.legalBusinessName.trim().length > 0 && profile.country.trim().length > 0;
}

export function buildPurchaseContextHash(planId: string, profile: LicenseeProfile): string {
  return sha256Hex(
    JSON.stringify({
      planId,
      legalBusinessName: profile.legalBusinessName,
      country: profile.country,
      state: profile.state,
      filingId: profile.filingId,
      businessAddress: profile.businessAddress,
      city: profile.city,
      postalCode: profile.postalCode,
      businessEmail: profile.businessEmail,
    }),
  );
}

export async function resolveAccountEmailForRepoGuid(repoGuid: string): Promise<string> {
  const body = await getUsersListBody();
  if (!body) {
    throw new LicenseCommerceError("user_not_found", "users-list not found.");
  }
  const parsed = yaml.load(body) as {
    users?: Array<{ repoGuid?: string; email?: string }>;
  };
  const match = parsed.users?.find((u) => u.repoGuid === repoGuid);
  const email = match?.email?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new LicenseCommerceError("user_not_found", "Account email not found for this user.");
  }
  return email;
}

async function invalidatePurchaseVerification(client: import("pg").PoolClient, repoGuid: string): Promise<void> {
  await client.query(`DELETE FROM cp_purchase_email_verifications WHERE repo_guid = $1`, [repoGuid]);
}

function mapProfileRow(r: {
  repo_guid: string;
  legal_business_name: string;
  country: string;
  state: string | null;
  filing_id: string | null;
  business_address: string | null;
  city: string | null;
  postal_code: string | null;
  business_email: string | null;
}): LicenseeProfile {
  return {
    repoGuid: r.repo_guid,
    legalBusinessName: r.legal_business_name,
    country: r.country,
    state: r.state,
    filingId: r.filing_id,
    businessAddress: r.business_address,
    city: r.city,
    postalCode: r.postal_code,
    businessEmail: r.business_email,
  };
}

const PROFILE_SELECT = `repo_guid, legal_business_name, country, state, filing_id, business_address,
                        city, postal_code, business_email`;

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
      license_period_months: number;
      territory: string;
      active: boolean;
    }>(
      `SELECT id, product_name, product_version, user_count, amount_minor, currency,
              license_period, license_period_months, territory, active
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
      license_period_months: number;
      territory: string;
      active: boolean;
    }>(
      `SELECT id, product_name, product_version, user_count, amount_minor, currency,
              license_period, license_period_months, territory, active
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
  license_period_months: number;
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
    licensePeriodMonths: Number(r.license_period_months ?? 1),
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
  return getLicenseeProfileByRepoGuid(getCurrentRepoGuid());
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
      city: string | null;
      postal_code: string | null;
      business_email: string | null;
    }>(
      `SELECT ${PROFILE_SELECT}
       FROM cp_licensee_profiles
       WHERE repo_guid = $1
       LIMIT 1`,
      [repoGuid],
    );
    if (rows.length === 0) return null;
    return mapProfileRow(rows[0]);
  });
}

export interface SaveLicenseeProfileInput {
  legalBusinessName: string;
  country: string;
  state?: string | null;
  filingId?: string | null;
  businessAddress?: string | null;
  city?: string | null;
  postalCode?: string | null;
  businessEmail?: string | null;
}

function requireNonEmpty(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new LicenseCommerceError("profile_required", `${label} is required.`);
  }
  return value.trim();
}

export async function saveLicenseeProfile(input: SaveLicenseeProfileInput): Promise<LicenseeProfile> {
  const repoGuid = getCurrentRepoGuid();
  const legalBusinessName = requireNonEmpty(input.legalBusinessName, "Company / legal name");
  const country = requireNonEmpty(input.country, "Country");
  const businessEmail = input.businessEmail?.trim() || null;
  if (businessEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(businessEmail)) {
    throw new LicenseCommerceError("profile_required", "Business email is invalid.");
  }

  return withPostgresClient(async (client) => {
    await invalidatePurchaseVerification(client, repoGuid);
    const { rows } = await client.query<{
      repo_guid: string;
      legal_business_name: string;
      country: string;
      state: string | null;
      filing_id: string | null;
      business_address: string | null;
      city: string | null;
      postal_code: string | null;
      business_email: string | null;
    }>(
      `INSERT INTO cp_licensee_profiles (
         repo_guid, legal_business_name, country, state, filing_id, business_address,
         city, postal_code, business_email, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())
       ON CONFLICT (repo_guid) DO UPDATE SET
         legal_business_name = EXCLUDED.legal_business_name,
         country = EXCLUDED.country,
         state = EXCLUDED.state,
         filing_id = EXCLUDED.filing_id,
         business_address = EXCLUDED.business_address,
         city = EXCLUDED.city,
         postal_code = EXCLUDED.postal_code,
         business_email = EXCLUDED.business_email,
         updated_at = now()
       RETURNING ${PROFILE_SELECT}`,
      [
        repoGuid,
        legalBusinessName,
        country,
        input.state?.trim() || null,
        input.filingId?.trim() || null,
        input.businessAddress?.trim() || null,
        input.city?.trim() || null,
        input.postalCode?.trim() || null,
        businessEmail,
      ],
    );
    return mapProfileRow(rows[0]);
  });
}

export async function getPurchaseVerificationForPlan(planId: string): Promise<PurchaseEmailVerification | null> {
  const repoGuid = getCurrentRepoGuid();
  const profile = await getLicenseeProfileByRepoGuid(repoGuid);
  if (!profile || !isBusinessProfileComplete(profile)) {
    return null;
  }
  const contextHash = buildPurchaseContextHash(planId, profile);
  const accountEmail = await resolveAccountEmailForRepoGuid(repoGuid);

  return withPostgresClient(async (client) => {
    const { rows } = await client.query<{
      account_email: string;
      context_hash: string;
      verified_at: string | null;
    }>(
      `SELECT account_email, context_hash, verified_at
       FROM cp_purchase_email_verifications
       WHERE repo_guid = $1
       LIMIT 1`,
      [repoGuid],
    );
    if (rows.length === 0) {
      return { accountEmail, verifiedAt: null, contextHash: null };
    }
    const row = rows[0];
    if (row.context_hash !== contextHash || row.account_email !== accountEmail) {
      return { accountEmail, verifiedAt: null, contextHash: null };
    }
    return {
      accountEmail: row.account_email,
      verifiedAt: row.verified_at,
      contextHash: row.context_hash,
    };
  });
}

export interface RequestPurchaseEmailOtpResult {
  email: string;
  expiresAt: string;
  /** Present only in local CHAD — no mailer exists in this repo. */
  localDevCode?: string;
  emailConfigured: boolean;
}

export async function requestPurchaseEmailOtp(planId: unknown): Promise<RequestPurchaseEmailOtpResult> {
  const repoGuid = getCurrentRepoGuid();
  if (typeof planId !== "string" || !planId.trim()) {
    throw new LicenseCommerceError("plan_not_found", "Select a license plan.");
  }
  await getLicensePlan(planId.trim());
  const profile = await getLicenseeProfileByRepoGuid(repoGuid);
  if (!isBusinessProfileComplete(profile)) {
    throw new LicenseCommerceError(
      "business_incomplete",
      "Complete business details in Account → Business before verification.",
    );
  }
  const accountEmail = await resolveAccountEmailForRepoGuid(repoGuid);
  const contextHash = buildPurchaseContextHash(planId.trim(), profile);
  const chadEnv = process.env.CHAD_ENVIRONMENT || "local";
  const emailConfigured = chadEnv === "local";
  if (!emailConfigured) {
    throw new LicenseCommerceError(
      "email_not_configured",
      "Email verification is not configured — no mail provider is available in this environment.",
    );
  }

  const code = String(randomInt(100000, 1000000));
  const codeHash = sha256Hex(code);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();

  await withPostgresClient(async (client) => {
    const { rows } = await client.query<{ last_sent_at: string | null }>(
      `SELECT last_sent_at FROM cp_purchase_email_verifications WHERE repo_guid = $1 LIMIT 1`,
      [repoGuid],
    );
    if (rows[0]?.last_sent_at) {
      const elapsed = Date.now() - new Date(rows[0].last_sent_at).getTime();
      if (elapsed < OTP_RESEND_MIN_MS) {
        throw new LicenseCommerceError("otp_invalid", "Wait before requesting another code.");
      }
    }

    await client.query(
      `INSERT INTO cp_purchase_email_verifications (
         repo_guid, account_email, context_hash, code_hash, expires_at, attempts,
         verified_at, last_sent_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,0,NULL, now(), now())
       ON CONFLICT (repo_guid) DO UPDATE SET
         account_email = EXCLUDED.account_email,
         context_hash = EXCLUDED.context_hash,
         code_hash = EXCLUDED.code_hash,
         expires_at = EXCLUDED.expires_at,
         attempts = 0,
         verified_at = NULL,
         last_sent_at = now(),
         updated_at = now()`,
      [repoGuid, accountEmail, contextHash, codeHash, expiresAt],
    );
  });

  const result: RequestPurchaseEmailOtpResult = {
    email: accountEmail,
    expiresAt,
    emailConfigured,
  };
  if (chadEnv === "local") {
    result.localDevCode = code;
  }
  return result;
}

/** @deprecated Use requestPurchaseEmailOtp */
export async function requestRepresentativeOtp(planId?: unknown): Promise<RequestPurchaseEmailOtpResult> {
  return requestPurchaseEmailOtp(typeof planId === "string" ? planId : "");
}

export async function confirmPurchaseEmailOtp(
  planId: unknown,
  code: unknown,
): Promise<PurchaseEmailVerification> {
  const repoGuid = getCurrentRepoGuid();
  if (typeof planId !== "string" || !planId.trim()) {
    throw new LicenseCommerceError("plan_not_found", "Select a license plan.");
  }
  if (typeof code !== "string" || !/^\d{6}$/.test(code.trim())) {
    throw new LicenseCommerceError("otp_invalid", "Enter the 6-digit verification code.");
  }
  const profile = await getLicenseeProfileByRepoGuid(repoGuid);
  if (!isBusinessProfileComplete(profile)) {
    throw new LicenseCommerceError("business_incomplete", "Complete business details first.");
  }
  const accountEmail = await resolveAccountEmailForRepoGuid(repoGuid);
  const contextHash = buildPurchaseContextHash(planId.trim(), profile);

  return withPostgresClient(async (client) => {
    const { rows } = await client.query<{
      account_email: string;
      context_hash: string;
      code_hash: string | null;
      expires_at: string | null;
      attempts: number;
    }>(
      `SELECT account_email, context_hash, code_hash, expires_at, attempts
       FROM cp_purchase_email_verifications
       WHERE repo_guid = $1
       LIMIT 1`,
      [repoGuid],
    );
    if (rows.length === 0) {
      throw new LicenseCommerceError("otp_invalid", "No verification code is pending.");
    }
    const otp = rows[0];
    const expiresAt = otp.expires_at;
    if (!otp.code_hash || !expiresAt) {
      throw new LicenseCommerceError("otp_invalid", "No verification code is pending.");
    }
    if (otp.attempts >= OTP_MAX_ATTEMPTS) {
      throw new LicenseCommerceError("otp_invalid", "Too many attempts — request a new code.");
    }
    if (new Date(expiresAt).getTime() < Date.now()) {
      throw new LicenseCommerceError("otp_expired", "Verification code expired — request a new one.");
    }
    if (otp.account_email !== accountEmail || otp.context_hash !== contextHash) {
      throw new LicenseCommerceError("otp_invalid", "Business or account context changed — request a new code.");
    }
    if (otp.code_hash !== sha256Hex(code.trim())) {
      await client.query(
        `UPDATE cp_purchase_email_verifications SET attempts = attempts + 1, updated_at = now() WHERE repo_guid = $1`,
        [repoGuid],
      );
      throw new LicenseCommerceError("otp_invalid", "Verification code is incorrect.");
    }

    const { rows: updated } = await client.query<{ verified_at: string }>(
      `UPDATE cp_purchase_email_verifications
       SET verified_at = now(), code_hash = NULL, expires_at = NULL, updated_at = now()
       WHERE repo_guid = $1
       RETURNING verified_at`,
      [repoGuid],
    );
    return {
      accountEmail,
      verifiedAt: updated[0].verified_at,
      contextHash,
    };
  });
}

/** @deprecated Use confirmPurchaseEmailOtp */
export async function confirmRepresentativeOtp(code: unknown): Promise<PurchaseEmailVerification> {
  return confirmPurchaseEmailOtp("", code);
}

export async function createLicenseAcceptance(input: {
  planId: unknown;
  paymentMethod?: unknown;
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
  if (!isBusinessProfileComplete(profile)) {
    throw new LicenseCommerceError(
      "business_incomplete",
      "Complete business details in Account → Business before accepting the license.",
    );
  }
  const verification = await getPurchaseVerificationForPlan(plan.id);
  if (!verification?.verifiedAt) {
    throw new LicenseCommerceError("not_verified", "Verify your account email before accepting the license.");
  }
  const agreement = await getCurrentLicenseAgreement();
  const liveHash = sha256Hex(agreement.body);
  if (liveHash !== agreement.bodySha256) {
    throw new LicenseCommerceError("acceptance_mismatch", "License Agreement hash does not match stored body.");
  }

  const paymentMethod =
    typeof input.paymentMethod === "string" && input.paymentMethod.trim()
      ? input.paymentMethod.trim()
      : "stripe";

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
    licensePeriodMonths: plan.licensePeriodMonths,
    territory: plan.territory,
    amountMinor: plan.amountMinor,
    currency: plan.currency,
    paymentMethod,
    legalBusinessName: profile.legalBusinessName,
    country: profile.country,
    state: profile.state,
    filingId: profile.filingId,
    businessAddress: profile.businessAddress,
    city: profile.city,
    postalCode: profile.postalCode,
    businessEmail: profile.businessEmail,
    verifiedEmail: verification.accountEmail,
    emailVerifiedAt: verification.verifiedAt,
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

export async function resolveAccountEmailForCurrentUser(): Promise<string> {
  return resolveAccountEmailForRepoGuid(getCurrentRepoGuid());
}
