import { afterEach, describe, expect, it } from "vitest";
import {
  createGoogleContactsOAuthState,
  verifyGoogleContactsOAuthState,
} from "./google-contacts-oauth-state.js";

describe("google-contacts OAuth state", () => {
  afterEach(() => {
    delete process.env.SESSION_SIGNING_SECRET;
    delete process.env.SECRETS_ENCRYPTION_KEY;
  });

  it("round-trips for the same repoGuid and rejects another user", () => {
    process.env.SESSION_SIGNING_SECRET = "test-signing-secret-for-oauth-state";
    const state = createGoogleContactsOAuthState("repo-a");
    expect(verifyGoogleContactsOAuthState(state, "repo-a")).toEqual({ ok: true });
    expect(verifyGoogleContactsOAuthState(state, "repo-b").ok).toBe(false);
  });

  it("rejects tampered state", () => {
    process.env.SESSION_SIGNING_SECRET = "test-signing-secret-for-oauth-state";
    const state = createGoogleContactsOAuthState("repo-a");
    const tampered = state.slice(0, -4) + "xxxx";
    expect(verifyGoogleContactsOAuthState(tampered, "repo-a").ok).toBe(false);
  });
});
