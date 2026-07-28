/**
 * API smoke for Msg Auto Links (Story 90) — 401 without session.
 * Full GET/POST against a live stack is covered after local/TEST deploy.
 */
import { describe, expect, it } from "vitest";

const BASE = process.env.LOCAL_DASHBOARD_BASE_URL || "http://localhost:12020";

describe("msg-automation links API", () => {
  it("GET returns 401 without session", async () => {
    const res = await fetch(`${BASE}/api/msg-automation/links`);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toBe("NOT_AUTHENTICATED");
  });

  it("POST returns 401 without session", async () => {
    const res = await fetch(`${BASE}/api/msg-automation/links`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ links: [] }),
    });
    expect(res.status).toBe(401);
  });

  it("POST auto-match returns 401 without session", async () => {
    const res = await fetch(`${BASE}/api/msg-automation/links/auto-match`, {
      method: "POST",
    });
    expect(res.status).toBe(401);
  });
});
