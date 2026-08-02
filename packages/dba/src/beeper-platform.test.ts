import { describe, it, expect } from "vitest";
import {
  normalizeBeeperNetwork,
  resolveBeeperPlatformNetwork,
  getBeeperPlatformMeta,
} from "./beeper-platform.js";

describe("normalizeBeeperNetwork", () => {
  it("maps live bridge ids from inventory", () => {
    expect(normalizeBeeperNetwork("local-whatsapp_ba_WXC68lbBACicADQzy2aBv9LO8QY")).toBe("whatsapp");
    expect(normalizeBeeperNetwork("local-instagram_ba_jGKdXt7denyl2H_ggqJ62oxm6OU")).toBe(
      "instagram"
    );
  });

  it("maps short aliases from docs / other bridges", () => {
    expect(normalizeBeeperNetwork("whatsapp")).toBe("whatsapp");
    expect(normalizeBeeperNetwork("Telegram")).toBe("telegram");
    expect(normalizeBeeperNetwork("signal")).toBe("signal");
    expect(normalizeBeeperNetwork("imessage")).toBe("imessage");
    expect(normalizeBeeperNetwork("gcm")).toBe("sms");
    expect(normalizeBeeperNetwork("sms")).toBe("sms");
    expect(normalizeBeeperNetwork("facebook")).toBe("facebook");
    expect(normalizeBeeperNetwork("messenger")).toBe("facebook");
  });

  it("treats Beeper plumbing networks as unknown", () => {
    expect(normalizeBeeperNetwork("matrix")).toBe("unknown");
    expect(normalizeBeeperNetwork("hungryserv")).toBe("unknown");
    expect(normalizeBeeperNetwork("$other")).toBe("unknown");
    expect(normalizeBeeperNetwork("$space")).toBe("unknown");
  });

  it("falls back for empty / null / unrecognized", () => {
    expect(normalizeBeeperNetwork(null)).toBe("unknown");
    expect(normalizeBeeperNetwork("")).toBe("unknown");
    expect(normalizeBeeperNetwork("totally-made-up-bridge")).toBe("unknown");
  });
});

describe("resolveBeeperPlatformNetwork", () => {
  const wa = "local-whatsapp_ba_abc";
  const ig = "local-instagram_ba_xyz";

  it("prefers lastMessage network for the presented conversation", () => {
    expect(
      resolveBeeperPlatformNetwork({
        lastMessageNetwork: ig,
        channelNetworks: [wa],
        identityNetworks: [wa, ig],
      })
    ).toBe(ig);
  });

  it("uses a single channel network when lastMessage is missing", () => {
    expect(
      resolveBeeperPlatformNetwork({
        lastMessageNetwork: null,
        channelNetworks: [wa, "$other"],
        identityNetworks: [wa, ig],
      })
    ).toBe(wa);
  });

  it("does not pick identities[0] when multiple real networks exist", () => {
    expect(
      resolveBeeperPlatformNetwork({
        lastMessageNetwork: null,
        channelNetworks: [wa, ig],
        identityNetworks: [wa, ig],
      })
    ).toBeNull();
  });

  it("falls back to a single identity network", () => {
    expect(
      resolveBeeperPlatformNetwork({
        identityNetworks: [ig, "matrix"],
      })
    ).toBe(ig);
  });

  it("returns null when nothing meaningful is known", () => {
    expect(
      resolveBeeperPlatformNetwork({
        lastMessageNetwork: "matrix",
        channelNetworks: ["$space"],
        identityNetworks: ["hungryserv"],
      })
    ).toBeNull();
  });
});

describe("getBeeperPlatformMeta", () => {
  it("returns human labels for each key", () => {
    expect(getBeeperPlatformMeta("whatsapp").label).toBe("WhatsApp");
    expect(getBeeperPlatformMeta("unknown").label).toBe("Unknown");
  });
});
