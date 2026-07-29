/**
 * Story 87 — login regression without a browser.
 * Hits the same path the login panel uses: POST /api/auth/login against
 * the already-running local Docker dashboard.
 *
 * Run: LOCAL_DASHBOARD_BASE_URL=http://localhost:12020 vitest run test/integration/local-login-api.test.mjs
 */
import { describe, it, expect, beforeAll } from "vitest";

const BASE = process.env.LOCAL_DASHBOARD_BASE_URL || "http://localhost:12020";
const PASSWORD = process.env.E2E_LOGIN_PASSWORD || "changeme";

async function login(username, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body, setCookie: res.headers.getSetCookie?.() ?? [] };
}

beforeAll(async () => {
  const probe = await fetch(`${BASE}/login`).catch(() => null);
  if (!probe || !probe.ok) {
    throw new Error(
      `Local dashboard not reachable at ${BASE} — start with bash-scripts/dashboard/03_local_mac_docker/03_re-start.sh`
    );
  }
});

describe("Local Docker — login API (panel backend)", () => {
  it("pawel_f signs in with local seed password", async () => {
    const { status, body } = await login("pawel_f", PASSWORD);
    expect(status).toBe(200);
    expect(body.user?.username).toBe("pawel_f");
    expect(body.user?.repoGuid).toBe("21d11bdc-f1f4-44d1-b61a-3fa6b039c641");
  });

  it("test3 also signs in", async () => {
    // Story 89: test3 is the one sanctioned disposable fixture (deterministic
    // seed password, isolated from real data) — automated tests never depend
    // on `local_dev` here, since it's a manually-managed real account with an
    // unknown/unowned password, not a controlled test fixture (see
    // tests/release-audit-report.md, READY FOR BOSS audit section 4).
    const { status, body } = await login("test3", PASSWORD);
    expect(status).toBe(200);
    expect(body.user?.username).toBe("test3");
  });

  it("unknown user and wrong password return Invalid credentials", async () => {
    const missing = await login("definitely_not_a_user", PASSWORD);
    expect(missing.status).toBe(401);
    expect(missing.body.error).toBe("Invalid credentials");

    const badPass = await login("pawel_f", "definitely-not-the-password");
    expect(badPass.status).toBe(401);
    expect(badPass.body.error).toBe("Invalid credentials");
  });
});
