import { describe, expect, it } from "vitest";
import { googleContactsLinkProvider, type GoogleContactsProviderIndex } from "./google-contacts-provider.js";
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

describe("googleContactsLinkProvider.findMatchesForLead", () => {
  it("matches multiple google contacts for one lead", () => {
    const index: GoogleContactsProviderIndex = {
      connected: true,
      candidates: [
        { resourceName: "people/c1", displayName: "Anna", phone: "600123456", phoneDigits: ["600123456"] },
        { resourceName: "people/c2", displayName: "Anna Work", phone: "600123456", phoneDigits: ["600123456"] },
      ],
    };
    const matches = googleContactsLinkProvider.findMatchesForLead(lead(), index);
    expect(matches.map((m) => m.resourceName)).toEqual(["people/c1", "people/c2"]);
  });

  it("skips silently (no throw) when not connected", () => {
    const index: GoogleContactsProviderIndex = { connected: false, candidates: [] };
    const matches = googleContactsLinkProvider.findMatchesForLead(lead(), index);
    expect(matches).toHaveLength(0);
  });

  it("skips when connected but this pass errored", () => {
    const index: GoogleContactsProviderIndex = {
      connected: true,
      candidates: [{ resourceName: "people/c1", displayName: "Anna", phone: "600123456", phoneDigits: ["600123456"] }],
      error: "token expired",
    };
    const matches = googleContactsLinkProvider.findMatchesForLead(lead(), index);
    expect(matches).toHaveLength(0);
  });

  it("skips a contact already linked to this lead (no duplicate)", () => {
    const index: GoogleContactsProviderIndex = {
      connected: true,
      candidates: [{ resourceName: "people/c1", displayName: "Anna", phone: "600123456", phoneDigits: ["600123456"] }],
    };
    const existing = {
      beeper: [],
      googleContacts: [
        { resourceName: "people/c1", displayName: "Anna", phone: "600123456", method: "automatic" as const, matchedOn: "phone" as const, updatedAt: "x" },
      ],
    };
    const matches = googleContactsLinkProvider.findMatchesForLead(lead({ existing }), index);
    expect(matches).toHaveLength(0);
  });
});
