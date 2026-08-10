import { describe, expect, it } from "vitest";
import { paymentsPublicOrigin } from "./payments-public-origin.js";

describe("paymentsPublicOrigin", () => {
  it("prefers forwarded proto/host (behind Docker/nginx)", () => {
    expect(
      paymentsPublicOrigin({
        forwardedProto: "https",
        forwardedHost: "app.example.com",
        requestUrl: "http://0.0.0.0:3000/api/settings/payments/checkout",
      }),
    ).toBe("https://app.example.com");
  });

  it("falls back to request.url when no forwarded headers are present", () => {
    expect(
      paymentsPublicOrigin({
        requestUrl: "http://localhost:12020/api/settings/payments/checkout",
      }),
    ).toBe("http://localhost:12020");
  });

  it("falls back to the plain host header when x-forwarded-host is absent", () => {
    expect(
      paymentsPublicOrigin({
        forwardedProto: "https",
        host: "chad.example.com",
        requestUrl: "http://0.0.0.0:3000/api/settings/payments/checkout",
      }),
    ).toBe("https://chad.example.com");
  });
});
