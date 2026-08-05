import { describe, expect, it } from "vitest";
import { beeperLinkProvider, type BeeperProviderIndex } from "./beeper-provider.js";
import type { LeadMatchContext } from "./types.js";

function lead(overrides: Partial<LeadMatchContext> = {}): LeadMatchContext {
  return {
    leadName: "26-08-05_pn_Anna",
    leadLoca: "01/01/01",
    phoneDigits: ["600123456"],
    existing: { beeper: [], googleContacts: [] },
    ...overrides,
  };
}

describe("beeperLinkProvider.findMatchesForLead", () => {
  it("matches multiple chats for one lead (one-to-many)", () => {
    const index: BeeperProviderIndex = [
      { chatId: "chat1", type: "whatsapp", displayName: "Anna", phoneDigits: ["600123456"] },
      { chatId: "chat2", type: "instagram", displayName: "Anna IG", phoneDigits: ["600123456"] },
    ];
    const matches = beeperLinkProvider.findMatchesForLead(lead(), index);
    expect(matches.map((m) => m.chatId)).toEqual(["chat1", "chat2"]);
  });

  it("matches on last-9-digits when the country code differs", () => {
    const index: BeeperProviderIndex = [
      { chatId: "chat1", type: "whatsapp", displayName: "Anna", phoneDigits: ["48600123456"] },
    ];
    const matches = beeperLinkProvider.findMatchesForLead(lead({ phoneDigits: ["600123456"] }), index);
    expect(matches).toHaveLength(1);
  });

  it("skips a chat already linked to this lead (no duplicate)", () => {
    const index: BeeperProviderIndex = [
      { chatId: "chat1", type: "whatsapp", displayName: "Anna", phoneDigits: ["600123456"] },
    ];
    const existing = {
      beeper: [{ chatId: "chat1", type: "whatsapp", method: "automatic" as const, matchedOn: "phone" as const, updatedAt: "x" }],
      googleContacts: [],
    };
    const matches = beeperLinkProvider.findMatchesForLead(lead({ existing }), index);
    expect(matches).toHaveLength(0);
  });

  it("returns nothing when the lead has no phone", () => {
    const index: BeeperProviderIndex = [
      { chatId: "chat1", type: "whatsapp", displayName: "Anna", phoneDigits: ["600123456"] },
    ];
    const matches = beeperLinkProvider.findMatchesForLead(lead({ phoneDigits: [] }), index);
    expect(matches).toHaveLength(0);
  });

  it("returns nothing for unrelated phone numbers", () => {
    const index: BeeperProviderIndex = [
      { chatId: "chat1", type: "whatsapp", displayName: "Anna", phoneDigits: ["700999888"] },
    ];
    const matches = beeperLinkProvider.findMatchesForLead(lead(), index);
    expect(matches).toHaveLength(0);
  });
});
