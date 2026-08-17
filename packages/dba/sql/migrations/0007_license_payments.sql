-- Story 124 — license commerce on top of Story 116 Stripe payments.
-- Additive. Existing cp_stripe_payments rows become kind=real (they were
-- user-initiated Stripe checkouts). Admin TEST records are a separate
-- business kind — never inferred from Stripe livemode, amount, or product name.

ALTER TABLE cp_stripe_payments
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'real',
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'stripe',
  ADD COLUMN IF NOT EXISTS license_acceptance_id text,
  ADD COLUMN IF NOT EXISTS plan_id text,
  ADD COLUMN IF NOT EXISTS license_user_count integer,
  ADD COLUMN IF NOT EXISTS license_period text,
  ADD COLUMN IF NOT EXISTS license_territory text,
  ADD COLUMN IF NOT EXISTS license_activated_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_by_admin_username text;

ALTER TABLE cp_stripe_payments DROP CONSTRAINT IF EXISTS cp_stripe_payments_kind_check;
ALTER TABLE cp_stripe_payments
  ADD CONSTRAINT cp_stripe_payments_kind_check CHECK (kind IN ('real', 'test'));

ALTER TABLE cp_stripe_payments DROP CONSTRAINT IF EXISTS cp_stripe_payments_provider_check;
ALTER TABLE cp_stripe_payments
  ADD CONSTRAINT cp_stripe_payments_provider_check
  CHECK (provider IN ('stripe', 'revolut', 'admin_test'));

ALTER TABLE cp_stripe_payments DROP CONSTRAINT IF EXISTS cp_stripe_payments_status_check;
ALTER TABLE cp_stripe_payments
  ADD CONSTRAINT cp_stripe_payments_status_check
  CHECK (status IN ('pending', 'completed', 'failed', 'canceled'));

CREATE INDEX IF NOT EXISTS cp_stripe_payments_repo_kind_idx
  ON cp_stripe_payments (repo_guid, kind, created_at DESC);

CREATE TABLE IF NOT EXISTS cp_license_plans (
  id text PRIMARY KEY,
  product_name text NOT NULL,
  product_version text NOT NULL,
  user_count integer NOT NULL CHECK (user_count > 0),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL,
  license_period text NOT NULL,
  territory text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO cp_license_plans (
  id, product_name, product_version, user_count, amount_minor, currency, license_period, territory, active
) VALUES
  ('chad-dashboard-1u', 'CHAD Dashboard', '1', 1, 80000, 'PLN', '12 months', 'Poland', true),
  ('chad-dashboard-2u', 'CHAD Dashboard', '1', 2, 160000, 'PLN', '12 months', 'Poland', true),
  ('chad-dashboard-3u', 'CHAD Dashboard', '1', 3, 240000, 'PLN', '12 months', 'Poland', true)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS cp_licensee_profiles (
  repo_guid text PRIMARY KEY,
  legal_business_name text NOT NULL,
  country text NOT NULL,
  state text,
  filing_id text,
  business_address text,
  representative_full_name text NOT NULL,
  representative_email text NOT NULL,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cp_licensee_email_otp (
  repo_guid text PRIMARY KEY,
  email text NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cp_license_agreement_versions (
  version text PRIMARY KEY,
  title text NOT NULL,
  body text NOT NULL,
  body_sha256 text NOT NULL,
  draft boolean NOT NULL DEFAULT true,
  published_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION cp_license_agreement_versions_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'cp_license_agreement_versions rows are immutable after publish';
END;
$$;

DROP TRIGGER IF EXISTS cp_license_agreement_versions_no_update ON cp_license_agreement_versions;
CREATE TRIGGER cp_license_agreement_versions_no_update
  BEFORE UPDATE OR DELETE ON cp_license_agreement_versions
  FOR EACH ROW
  EXECUTE PROCEDURE cp_license_agreement_versions_immutable();

INSERT INTO cp_license_agreement_versions (version, title, body, body_sha256, draft)
VALUES (
  '1.0-DRAFT',
  'CHAD Dashboard License Agreement (draft — requires approved legal text)',
  $AGREE$CHAD Dashboard License Agreement
Version 1.0-DRAFT
THIS TEXT IS A TECHNICAL PLACEHOLDER AND REQUIRES APPROVED LEGAL CONTENT BEFORE PRODUCTION USE.

This agreement grants a non-exclusive, non-transferable license to use the existing CHAD Dashboard software product, for the number of users and period stated on the accepted order, in the territory of Poland. It is not consulting, custom software development, or billed development/support hours.

The license fee is the amount stated on the accepted order. A new period requires a new acceptance. Product versioning of CHAD Dashboard is independent of this License Agreement version.
$AGREE$,
  'ca754b024346b8524107644da394c5e6b8129f8d9c12118774b123ea7118ba6b',
  true
)
ON CONFLICT (version) DO NOTHING;

CREATE TABLE IF NOT EXISTS cp_license_acceptances (
  id text PRIMARY KEY,
  repo_guid text NOT NULL,
  username text NOT NULL,
  plan_id text NOT NULL,
  agreement_version text NOT NULL,
  agreement_sha256 text NOT NULL,
  snapshot jsonb NOT NULL,
  snapshot_sha256 text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  ip text,
  user_agent text
);

CREATE INDEX IF NOT EXISTS cp_license_acceptances_repo_idx
  ON cp_license_acceptances (repo_guid, accepted_at DESC);
