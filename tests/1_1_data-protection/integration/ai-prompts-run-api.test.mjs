/**
 * AI Prompts conversation "run" endpoint — session boundary smoke test.
 * Full complete/error/provider-not-configured coverage against a real saved
 * prompt is exercised via the dba-level unit tests
 * (ai-prompts-openai.test.ts) and a real logged-in browser smoke test
 * (see the Story report) — this file only locks in the auth boundary that
 * every route in this feature must have (input §7: 401 without a session,
 * never a caller-supplied repoGuid).
 */
import { describe, expect, it } from "vitest";

const BASE = process.env.LOCAL_DASHBOARD_BASE_URL || "http://localhost:12020";

describe("msg-automation ai-prompts run API", () => {
  it("POST returns 401 without session", async () => {
    const res = await fetch(`${BASE}/api/msg-automation/ai-prompts/some-id/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "hi" }),
    });
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toBe("NOT_AUTHENTICATED");
    // Never leaks a key even on an auth-rejected request.
    expect(JSON.stringify(json)).not.toMatch(/sk-[a-zA-Z0-9]/);
  });
});
