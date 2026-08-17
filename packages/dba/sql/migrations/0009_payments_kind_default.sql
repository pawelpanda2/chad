-- Fix kind default after 0008 renamed real → user_payment.
ALTER TABLE cp_stripe_payments ALTER COLUMN kind SET DEFAULT 'user_payment';
