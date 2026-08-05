import { describe, expect, it } from "vitest";
import { googleContactsPublicOrigin } from "./google-contacts-public-origin.js";

describe("googleContactsPublicOrigin", () => {
  it("prefers origin from GOOGLE_CONTACTS_REDIRECT_URI", () => {
    expect(
      googleContactsPublicOrigin({
        redirectUriEnv: "http://localhost:12020/api/google-contacts/callback",
        requestUrl: "http://0.0.0.0:3000/api/google-contacts/callback",
      }),
    ).toBe("http://localhost:12020");
  });

  it("falls back to forwarded headers then request.url", () => {
    expect(
      googleContactsPublicOrigin({
        redirectUriEnv: "",
        forwardedProto: "https",
        forwardedHost: "app.example.com",
        requestUrl: "http://0.0.0.0:3000/api/google-contacts/callback",
      }),
    ).toBe("https://app.example.com");
    expect(
      googleContactsPublicOrigin({
        redirectUriEnv: null,
        requestUrl: "http://localhost:12020/api/google-contacts/callback",
      }),
    ).toBe("http://localhost:12020");
  });
});
