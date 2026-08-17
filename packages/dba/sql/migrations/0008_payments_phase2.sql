-- Story 124 Phase 2 — 1-month licenses, account-email purchase verification,
-- payment_kind rename, full Agreement 1.0-DRAFT, business profile fields.

-- Rename payment kinds (real → user_payment, test → admin_test).
ALTER TABLE cp_stripe_payments DROP CONSTRAINT IF EXISTS cp_stripe_payments_kind_check;
UPDATE cp_stripe_payments SET kind = 'user_payment' WHERE kind = 'real';
UPDATE cp_stripe_payments SET kind = 'admin_test' WHERE kind = 'test';
ALTER TABLE cp_stripe_payments
  ADD CONSTRAINT cp_stripe_payments_kind_check CHECK (kind IN ('user_payment', 'admin_test'));

ALTER TABLE cp_stripe_payments
  ADD COLUMN IF NOT EXISTS stripe_mode text;

UPDATE cp_stripe_payments
SET stripe_mode = CASE
  WHEN livemode IS TRUE THEN 'live'
  WHEN livemode IS FALSE THEN 'test'
  ELSE NULL
END
WHERE stripe_mode IS NULL;

-- License plans: 1 month, add 5/10 user tiers.
ALTER TABLE cp_license_plans
  ADD COLUMN IF NOT EXISTS license_period_months integer NOT NULL DEFAULT 1;

UPDATE cp_license_plans
SET license_period = '1 month', license_period_months = 1
WHERE license_period <> '1 month';

INSERT INTO cp_license_plans (
  id, product_name, product_version, user_count, amount_minor, currency,
  license_period, license_period_months, territory, active
) VALUES
  ('chad-dashboard-5u', 'CHAD Dashboard', '1', 5, 400000, 'PLN', '1 month', 1, 'Poland', true),
  ('chad-dashboard-10u', 'CHAD Dashboard', '1', 10, 800000, 'PLN', '1 month', 1, 'Poland', true)
ON CONFLICT (id) DO UPDATE SET
  license_period = EXCLUDED.license_period,
  license_period_months = EXCLUDED.license_period_months,
  active = EXCLUDED.active;

-- Business profile fields for Account → Business.
ALTER TABLE cp_licensee_profiles
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS business_email text;

ALTER TABLE cp_licensee_profiles
  ALTER COLUMN representative_full_name DROP NOT NULL,
  ALTER COLUMN representative_email DROP NOT NULL;

-- Purchase-flow email verification (account email OTP, not representative).
CREATE TABLE IF NOT EXISTS cp_purchase_email_verifications (
  repo_guid text PRIMARY KEY,
  account_email text NOT NULL,
  context_hash text NOT NULL,
  code_hash text,
  expires_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  verified_at timestamptz,
  last_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Replace placeholder Agreement 1.0-DRAFT only when no acceptances reference it yet.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cp_license_acceptances WHERE agreement_version = '1.0-DRAFT') THEN
    DROP TRIGGER IF EXISTS cp_license_agreement_versions_no_update ON cp_license_agreement_versions;
    DELETE FROM cp_license_agreement_versions WHERE version = '1.0-DRAFT';
    INSERT INTO cp_license_agreement_versions (version, title, body, body_sha256, draft)
    VALUES (
      '1.0-DRAFT',
      'CHAD DASHBOARD LICENSE AGREEMENT 1.0-DRAFT',
      $AGREE$CHAD DASHBOARD LICENSE AGREEMENT 1.0-DRAFT

Parties

This License Agreement ("Agreement") is entered into between the provider of the CHAD Dashboard software ("Licensor") and the business entity identified in the purchaser's CHAD Account → Business details ("Licensee"). The individual accepting this Agreement confirms that they are authorized to act on behalf of the Licensee.

Licensed Software

The Agreement covers access to the CHAD Dashboard, including the web-based dashboard functionality made available by the Licensor during the License Term ("Software").

The Software is provided as hosted software accessible online. No ownership of the Software, source code, trademarks, or other intellectual property is transferred to the Licensee.

License Grant

Subject to payment of the applicable license fee, the Licensor grants the Licensee a limited, non-exclusive, non-transferable right to access and use the Software for the Licensee's internal business purposes during the License Term.

The number of authorized users is the number selected as the License Type immediately before acceptance of this Agreement and is recorded with the acceptance.

License Term

Each purchased license is valid for 1 month from the start of the applicable paid license period.

The purchase covered by this Agreement does not itself create an automatic renewal or recurring subscription unless the checkout screen expressly states otherwise and the Licensee separately agrees to such recurring billing.

License Fee

The license fee is the amount displayed immediately before acceptance and payment.

The following values form part of the accepted transaction record:

number of authorized users;

license period: 1 month;

price;

currency;

payment method;

Agreement version.

Restrictions

The Licensee may not, except where mandatory law expressly permits otherwise:

sell, sublicense, rent, lease, or otherwise make the Software available to an unauthorized third party;

attempt to obtain or reconstruct source code through reverse engineering, decompilation, or disassembly;

circumvent access controls or technical usage restrictions;

use the Software in a manner that violates applicable law or the rights of third parties.

Nothing in this clause limits rights that cannot lawfully be excluded.

Accounts and Authorized Users

The Licensee is responsible for ensuring that access is used only by the number of authorized users covered by the purchased License Type.

The Licensee is responsible for protecting account credentials and for activity carried out through its authorized accounts, except to the extent caused by the Licensor's own breach or security failure.

Availability and Changes

The Licensor may maintain, update, improve, or modify the Software during the License Term.

Temporary interruptions may occur for maintenance, security, infrastructure failures, or events outside the Licensor's reasonable control.

No specific service level or uninterrupted availability is guaranteed unless separately agreed in writing.

Data

Data entered into CHAD by or for the Licensee remains subject to the applicable data-handling and privacy rules presented by the Licensor.

This Agreement does not transfer ownership of the Licensee's business data to the Licensor.

Any separate privacy notice, data-processing agreement, or data-retention rules applicable to CHAD remain separate from this license unless expressly incorporated.

Intellectual Property

All intellectual-property rights in the Software and its underlying technology remain with the Licensor or the relevant rights holder.

The Licensee receives only the limited right of use expressly granted by this Agreement.

Payment and Activation

The license may be activated after the payment provider confirms successful payment.

A redirect to a success page alone is not sufficient evidence of payment where the payment provider reports a different status.

The transaction record maintained by CHAD may include the payment provider's transaction identifiers, payment status, amount, currency, Agreement version, and acceptance record. CHAD does not store full payment-card numbers or CVC values.

Termination and Expiry

The right to use the Software under the purchased license expires at the end of the one-month License Term unless another license is purchased.

The Licensor may suspend access where reasonably necessary to address fraud, security incidents, unlawful use, material breach of this Agreement, or non-payment.

Any suspension or termination does not affect rights and obligations that by their nature survive expiry.

Liability

Each party remains responsible for liability that cannot lawfully be excluded or limited.

To the maximum extent permitted by applicable law, the Software is provided for business use and the Licensor is not liable for indirect or consequential business losses unless separately agreed or required by mandatory law.

Do not invent a monetary liability cap in this DRAFT version.

Governing Law

This Agreement is intended to be governed by Polish law, subject to any mandatory rules that apply regardless of this clause.

Do not hardcode an exclusive court/jurisdiction clause in the DRAFT until the business/legal decision has been confirmed.

Entire Transaction Record

The Agreement together with the transaction-specific values displayed and recorded at acceptance constitutes the license terms for that purchase.

The transaction-specific values include at least:

Licensee company name;

authorized user count;

one-month License Term;

license fee and currency;

payment method;

Agreement version;

acceptance timestamp.

Electronic Acceptance

The Agreement is accepted electronically after the purchaser:

is authenticated in CHAD;

successfully completes the required email verification;

is shown this Agreement;

affirmatively confirms acceptance.

CHAD records the acceptance details described above.

Version

Agreement version:
1.0-DRAFT

This DRAFT must not silently be changed after acceptance. Any substantive modification requires a new Agreement version.$AGREE$,
      '37f4cc05711b01584643d8e886337caee2c81b96fa6dddb71ec870ee38b0bdb7',
      true
    );
    CREATE TRIGGER cp_license_agreement_versions_no_update
      BEFORE UPDATE OR DELETE ON cp_license_agreement_versions
      FOR EACH ROW
      EXECUTE PROCEDURE cp_license_agreement_versions_immutable();
  END IF;
END $$;
