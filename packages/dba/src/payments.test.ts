/**
 * Real-Postgres, real-shared-server regression test for Story 116's
 * payments.ts — webhook signature verification, idempotent
 * `checkout.session.completed` handling, and cross-user isolation on
 * getPaymentStatus.
 *
 * Same class of test as leads-postgres.test.ts/admin-users-postgres.test.ts:
 * `getEffectivePostgresUri()` (dev-db-override.ts) has no "arbitrary local
 * database" mode by design (red-rules Rule 1 — LOCAL always resolves to the
 * real shared QNAP Postgres), so this file loads real QNAP credentials from
 * `.env.local`/`.env.qnap` (gitignored, never printed) the same way
 * `tests/support/database/qnap-env.mjs` does for QNAP-targeted tests
 * elsewhere in this repo — duplicated inline rather than imported, since
 * `packages/dba`'s own `tsconfig.json` (`rootDir: "./src"`) cannot resolve
 * an import reaching outside `packages/dba/src`.
 *
 * Per the user's explicit correction: this test acts as the REAL `test2`
 * account (CHAD's disposable/resettable test repo — resolved dynamically
 * from the real `chad_admin/users/users-list`, never hardcoded/guessed) for
 * every "acting user" scenario, and the real, already-confirmed `test3`
 * (`testing/test3-guard.ts`) for the cross-user-isolation negative check —
 * never a synthetic/fake repoGuid. Only the Stripe Checkout Session ids
 * (which don't correspond to anything in a real Stripe account either) are
 * synthetic, prefixed `story116_test_` so they can't collide with a real
 * session id, and `afterAll` deletes exactly those rows by id — no
 * TRUNCATE, no wildcard DELETE, and test2/test3's own repo data is never
 * touched (this table only stores Payments rows, nothing under their CP
 * item trees).
 *
 * Session creation itself (a real network call to Stripe) is NOT exercised
 * here — no real Sandbox key is available in this environment. That path
 * is covered structurally (PaymentsNotConfiguredError when unconfigured)
 * and via packages/payments's own unit tests for amount validation.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
dotenv.config({ path: path.join(REPO_ROOT, ".env.local") });
dotenv.config({ path: path.join(REPO_ROOT, ".env.qnap"), override: true });

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import Stripe from "stripe";
import yaml from "js-yaml";
import { QNAP_TAILSCALE_HOST, QNAP_POSTGRES_PORT } from "./dev-db-hosts.js";
import { withPostgresClient, closePostgresConnection } from "./postgres.js";
import { runWithRepoContext } from "./repo-context.js";
import { getUsersListBody } from "./admin-users.js";
import { TEST3_REPO_GUID, TEST3_USERNAME } from "./testing/test3-guard.js";
import {
  createPaymentCheckoutSession,
  getPaymentStatus,
  handleStripeWebhookEvent,
  PaymentsNotConfiguredError,
} from "./payments.js";
import { InvalidWebhookSignatureError } from "payments";

// Same precedence as dev-db-override.ts's requirePostgresCredentials(true).
const pgUser = process.env.POSTGRES_USER || "chad";
const pgPass = process.env.POSTGRES_QNAP_PASSWORD || process.env.POSTGRES_PASSWORD;
const pgDb = process.env.POSTGRES_DB || "chad";
if (pgPass) {
  process.env.POSTGRES_URI = `postgres://${encodeURIComponent(pgUser)}:${encodeURIComponent(pgPass)}@${QNAP_TAILSCALE_HOST}:${QNAP_POSTGRES_PORT}/${pgDb}`;
}
// Force the Postgres-only code path (same as leads-postgres.test.ts) — without
// this, item-ops.ts's data-router can try Content Provider/Mongo first, which
// aren't reachable from this test process and would otherwise hang.
process.env.DBA_PRIMARY_BACKEND = "postgres";
process.env.DBA_POSTGRES_ENABLED = "true";
process.env.DBA_MONGO_ENABLED = "false";
process.env.DBA_CONTENT_PROVIDER_ENABLED = "false";

const TEST2_USERNAME = "test2";

/** Resolves test2's real repoGuid from the real chad_admin/users/users-list — never hardcoded/guessed. */
async function resolveRepoGuidByUsername(username: string): Promise<string> {
  const body = await getUsersListBody();
  if (!body) {
    throw new Error("users-list item not found — cannot resolve a real test repoGuid.");
  }
  const parsed = yaml.load(body) as { users?: Array<{ repoGuid?: string; username?: string }> };
  const match = parsed.users?.find((u) => u.username?.toLowerCase() === username.toLowerCase());
  if (!match?.repoGuid) {
    throw new Error(`"${username}" not found in the real users-list — cannot run this integration test.`);
  }
  return match.repoGuid;
}

const WEBHOOK_SECRET = "whsec_test_secret_for_story_116_dba";

function signedCheckoutCompletedEvent(session: {
  id: string;
  payment_intent?: string;
  metadata?: Record<string, string>;
  client_reference_id?: string;
  amount_total?: number;
  currency?: string;
}): { rawBody: string; signature: string } {
  const payload = JSON.stringify({
    id: `evt_${session.id}`,
    object: "event",
    type: "checkout.session.completed",
    data: { object: { object: "checkout.session", ...session } },
  });
  const stripe = new Stripe("sk_test_dummy_key_for_local_signing_only");
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
  return { rawBody: payload, signature };
}

const TEST_SESSION_IDS = [
  "story116_test_existing",
  "story116_test_isolation",
  "story116_test_idempotent",
  "story116_test_never_inserted",
  "story116_test_bad_sig",
];

async function ensureSchema(): Promise<void> {
  await withPostgresClient(async (client) => {
    const { rows } = await client.query("SELECT to_regclass('cp_stripe_payments') AS reg");
    if (rows[0].reg) return;
    const sqlPath = path.join(REPO_ROOT, "packages", "dba", "sql", "migrations", "0005_stripe_payments.sql");
    const sql = await readFile(sqlPath, "utf8");
    await client.query(sql);
  });
}

let test2RepoGuid: string;

beforeAll(async () => {
  await ensureSchema();
  test2RepoGuid = await resolveRepoGuidByUsername(TEST2_USERNAME);
});

afterAll(async () => {
  // Delete exactly this file's own rows, by exact id — never a wildcard
  // DELETE/TRUNCATE, since this table is the real shared one. test2/test3's
  // own repo/CP-item data is untouched — this table only ever stores
  // Payments rows.
  await withPostgresClient((client) =>
    client.query(`DELETE FROM cp_stripe_payments WHERE id = ANY($1::text[])`, [TEST_SESSION_IDS]),
  );
  await closePostgresConnection();
});

beforeEach(() => {
  process.env.STRIPE_SECRET_KEY = "sk_test_dummy_key_for_local_signing_only";
  process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
});

afterEach(() => {
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_WEBHOOK_SECRET;
});

describe("payments.ts — webhook + status (real Postgres, real test2/test3)", () => {
  it("processes a valid checkout.session.completed and getPaymentStatus reflects it, scoped to the paying user", async () => {
    await withPostgresClient((client) =>
      client.query(
        `INSERT INTO cp_stripe_payments (id, repo_guid, username, amount_minor, currency, status)
         VALUES ('story116_test_existing', $1, $2, 5000, 'PLN', 'pending')`,
        [test2RepoGuid, TEST2_USERNAME],
      ),
    );

    await expect(
      runWithRepoContext({ repoGuid: test2RepoGuid, username: TEST2_USERNAME }, () =>
        getPaymentStatus("story116_test_existing"),
      ),
    ).resolves.toBe("pending");

    const { rawBody, signature } = signedCheckoutCompletedEvent({
      id: "story116_test_existing",
      payment_intent: "pi_test_1",
      metadata: { repoGuid: test2RepoGuid, username: TEST2_USERNAME },
      client_reference_id: test2RepoGuid,
      amount_total: 5000,
      currency: "pln",
    });

    const result = await handleStripeWebhookEvent(rawBody, signature);
    expect(result).toEqual({ handled: true, type: "checkout.session.completed" });

    await expect(
      runWithRepoContext({ repoGuid: test2RepoGuid, username: TEST2_USERNAME }, () =>
        getPaymentStatus("story116_test_existing"),
      ),
    ).resolves.toBe("completed");
  });

  it("cross-user isolation — test3 never sees test2's payment", async () => {
    await withPostgresClient((client) =>
      client.query(
        `INSERT INTO cp_stripe_payments (id, repo_guid, username, amount_minor, currency, status)
         VALUES ('story116_test_isolation', $1, $2, 1000, 'PLN', 'completed')`,
        [test2RepoGuid, TEST2_USERNAME],
      ),
    );

    await expect(
      runWithRepoContext({ repoGuid: test2RepoGuid, username: TEST2_USERNAME }, () =>
        getPaymentStatus("story116_test_isolation"),
      ),
    ).resolves.toBe("completed");

    await expect(
      runWithRepoContext({ repoGuid: TEST3_REPO_GUID, username: TEST3_USERNAME }, () =>
        getPaymentStatus("story116_test_isolation"),
      ),
    ).resolves.toBe("not_found");
  });

  it("is idempotent — redelivering the same event never applies the effect twice", async () => {
    await withPostgresClient((client) =>
      client.query(
        `INSERT INTO cp_stripe_payments (id, repo_guid, username, amount_minor, currency, status)
         VALUES ('story116_test_idempotent', $1, $2, 5000, 'PLN', 'pending')`,
        [test2RepoGuid, TEST2_USERNAME],
      ),
    );

    const { rawBody, signature } = signedCheckoutCompletedEvent({
      id: "story116_test_idempotent",
      payment_intent: "pi_test_1",
      metadata: { repoGuid: test2RepoGuid, username: TEST2_USERNAME },
      client_reference_id: test2RepoGuid,
      amount_total: 5000,
      currency: "pln",
    });

    // Same event, delivered twice (Stripe's own redelivery guarantee).
    await handleStripeWebhookEvent(rawBody, signature);
    await handleStripeWebhookEvent(rawBody, signature);

    const { rows } = await withPostgresClient((client) =>
      client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM cp_stripe_payments WHERE id = 'story116_test_idempotent'`,
      ),
    );
    expect(rows[0].count).toBe("1");
  });

  it("reconstructs a missing row from event metadata (fallback upsert) rather than dropping the webhook", async () => {
    const { rawBody, signature } = signedCheckoutCompletedEvent({
      id: "story116_test_never_inserted",
      payment_intent: "pi_test_2",
      metadata: { repoGuid: test2RepoGuid, username: TEST2_USERNAME },
      amount_total: 12345,
      currency: "pln",
    });

    await handleStripeWebhookEvent(rawBody, signature);

    await expect(
      runWithRepoContext({ repoGuid: test2RepoGuid, username: TEST2_USERNAME }, () =>
        getPaymentStatus("story116_test_never_inserted"),
      ),
    ).resolves.toBe("completed");
  });

  it("rejects a missing/invalid webhook signature", async () => {
    const { rawBody } = signedCheckoutCompletedEvent({ id: "story116_test_bad_sig" });
    await expect(handleStripeWebhookEvent(rawBody, null)).rejects.toThrow(InvalidWebhookSignatureError);
    await expect(handleStripeWebhookEvent(rawBody, "t=1,v1=garbage")).rejects.toThrow(
      InvalidWebhookSignatureError,
    );
  });

  it("createPaymentCheckoutSession fails with a controlled error (not a crash) when Stripe isn't configured", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    await expect(
      runWithRepoContext({ repoGuid: test2RepoGuid, username: TEST2_USERNAME }, () =>
        createPaymentCheckoutSession("500", "http://localhost:12020"),
      ),
    ).rejects.toThrow(PaymentsNotConfiguredError);
  });
});
