// Shared helper (Story 78) for any test/script that needs to run AGAINST
// the real QNAP TEST deployment/Mongo, using test3. Never used for the
// worker-internals tests (those run against local Mongo — see
// backlog/stories/78/02_plan.md §1).
//
// Sets process.env.MONGODB_URI/BEEPER_MONGODB_URI to the same
// directConnection=true-over-Tailscale form
// bash-scripts/dashboard/03_local_mac_docker/01_config.sh's
// DBA_MONGO_MODE=qnap branch already uses for host (non-Docker) processes.
// Call this BEFORE importing anything from `dba` (env vars are read lazily,
// but importing first and setting env after is fragile to rely on).
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, "../../..");

const QNAP_TAILSCALE_HOST = "100.117.139.83";
const QNAP_MONGO_PORT = "12040"; // Beeper Mongo only — CHAD's own chad-mongodb was physically removed 2026-07-27.
const QNAP_POSTGRES_PORT = "12042";

export function loadQnapEnv() {
  dotenv.config({ path: path.join(REPO_ROOT, ".env.local") });
  dotenv.config({ path: path.join(REPO_ROOT, ".env.qnap"), override: true });

  const pgUser = process.env.POSTGRES_USER || "chad";
  const pgPass = process.env.POSTGRES_PASSWORD;
  const pgDb = process.env.POSTGRES_DB || "chad";
  if (!pgPass) {
    throw new Error(
      "POSTGRES_PASSWORD not set (expected in .env.qnap, gitignored) — cp_items/cp_history for " +
        "QNAP-TEST-targeted tests are read through PostgreSQL (chad-postgres), CHAD's real primary " +
        "backend since 2026-07-27's full Mongo removal."
    );
  }
  process.env.POSTGRES_URI = `postgres://${encodeURIComponent(pgUser)}:${encodeURIComponent(pgPass)}@${QNAP_TAILSCALE_HOST}:${QNAP_POSTGRES_PORT}/${pgDb}`;
  process.env.DBA_PRIMARY_BACKEND = "postgres";
  process.env.DBA_POSTGRES_ENABLED = "true";
  process.env.DBA_MONGO_ENABLED = "false";
  // QNAP TEST's real runtime shape (docker-compose.server1.test-prod.dashboard.yml)
  // — Content Provider is not part of that stack at all. Without this, dba's
  // dual-backend read path tries to also reach Content Provider (default
  // contentProviderEnabled: true) and fails on a missing CONTENT_PROVIDER_API_URL
  // that's irrelevant here.
  process.env.DBA_CONTENT_PROVIDER_ENABLED = "false";

  // Beeper Mongo — untouched, separate from CHAD's own cp_items/cp_history.
  // Only set if the (optional, Beeper-only) root credentials are present;
  // never required for a CHAD-only test that never touches Beeper data.
  const mongoUser = process.env.MONGO_ROOT_USERNAME;
  const mongoPass = process.env.MONGO_ROOT_PASSWORD;
  if (mongoUser && mongoPass) {
    process.env.BEEPER_MONGODB_URI = `mongodb://${mongoUser}:${mongoPass}@${QNAP_TAILSCALE_HOST}:${QNAP_MONGO_PORT}?authSource=admin&directConnection=true`;
  }
}

/** test3's real login password — never hardcoded/committed, see Story 78 01_input.md Input 3. */
export function getTest3Password() {
  const pw = process.env.E2E_TEST3_PASSWORD;
  if (!pw) {
    throw new Error(
      "E2E_TEST3_PASSWORD is not set. This must be provided as a local, gitignored env var " +
        "(never hardcoded/committed) to run any test that logs in as test3 through the real HTTP API."
    );
  }
  return pw;
}

/** test3's own dedicated Google Sheet, given directly by the project owner (Story 78 01_input.md Input 4). Never a secret — a spreadsheet ID alone grants nothing. */
export const TEST3_SPREADSHEET_ID = "1d_u_uRa0LILtksc25ATt--jh11mZDm7ABGyjAQuTdIc";

/** QNAP TEST dashboard's base URL, reachable over Tailscale — see .env.qnap's DASHBOARD_PORT / bash-scripts/dashboard/04_qnap_test. */
export const QNAP_TEST_BASE_URL = process.env.QNAP_TEST_BASE_URL || `http://${QNAP_TAILSCALE_HOST}:12020`;
