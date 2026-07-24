/**
 * Pure unit tests for lead↔Beeper link matching / save validation (Story 90).
 */
import { describe, expect, it } from "vitest";
import {
  buildPhoneMatchProposals,
  mergeAutoMatchLinks,
  normalizePhoneDigits,
  validateLinksForSave,
  LeadBeeperLinksError,
  type LeadBeeperLink,
  type LeadLinkCandidate,
  type ConversationLinkCandidate,
} from "./lead-beeper-links.js";

const NOW = "2026-07-26T00:00:00.000Z";

function manualLink(partial: Partial<LeadBeeperLink> = {}): LeadBeeperLink {
  return {
    id: "m1",
    leadName: "lead-a",
    leadLoca: "03/01",
    conversationId: "conv-a",
    conversationName: "WhatsApp · A",
    method: "manual",
    source: "manual",
    createdAt: NOW,
    updatedAt: NOW,
    ...partial,
  };
}

describe("normalizePhoneDigits", () => {
  it("strips non-digits and rejects short numbers", () => {
    expect(normalizePhoneDigits("+48 501 234 567")).toBe("48501234567");
    expect(normalizePhoneDigits("501-234-567")).toBe("501234567");
    expect(normalizePhoneDigits("12345")).toBeNull();
  });
});

describe("buildPhoneMatchProposals", () => {
  const leads: LeadLinkCandidate[] = [
    { leadName: "exact", leadLoca: "01", phones: ["+48 501 234 567"] },
    { leadName: "partial", leadLoca: "02", phones: ["501234567"] },
    { leadName: "none", leadLoca: "03", phones: [] },
  ];
  const conversations: ConversationLinkCandidate[] = [
    {
      conversationId: "c-exact",
      conversationName: "WhatsApp · Exact",
      phones: ["48501234567"],
    },
    {
      conversationId: "c-partial",
      conversationName: "WhatsApp · Partial",
      phones: ["48501234567"],
    },
  ];

  it("exact normalized phone → automatic", () => {
    const proposals = buildPhoneMatchProposals(leads, conversations, NOW);
    const exact = proposals.find((p) => p.leadName === "exact" && p.conversationId === "c-exact");
    expect(exact?.method).toBe("automatic");
    expect(exact?.source).toBe("phone");
  });

  it("last-9 match with different full strings → suggested", () => {
    const proposals = buildPhoneMatchProposals(leads, conversations, NOW);
    const partial = proposals.find(
      (p) => p.leadName === "partial" && p.conversationId === "c-partial"
    );
    expect(partial?.method).toBe("suggested");
  });

  it("no phone → no proposal", () => {
    const proposals = buildPhoneMatchProposals(leads, conversations, NOW);
    expect(proposals.some((p) => p.leadName === "none")).toBe(false);
  });
});

describe("mergeAutoMatchLinks", () => {
  it("does not overwrite manual links", () => {
    const existing = [manualLink()];
    const proposals: LeadBeeperLink[] = [
      {
        ...manualLink({
          id: "auto",
          method: "automatic",
          source: "phone",
          contactValue: "48501234567",
        }),
      },
    ];
    const merged = mergeAutoMatchLinks(existing, proposals, NOW);
    expect(merged).toHaveLength(1);
    expect(merged[0].method).toBe("manual");
    expect(merged[0].id).toBe("m1");
  });

  it("adds new automatic links when no existing pair", () => {
    const proposals: LeadBeeperLink[] = [
      manualLink({
        id: "a1",
        leadName: "other",
        conversationId: "conv-b",
        method: "automatic",
        source: "phone",
      }),
    ];
    const merged = mergeAutoMatchLinks([], proposals, NOW);
    expect(merged).toHaveLength(1);
    expect(merged[0].method).toBe("automatic");
  });
});

describe("validateLinksForSave", () => {
  it("accepts empty list", () => {
    expect(validateLinksForSave([])).toEqual([]);
  });

  it("rejects duplicates", () => {
    expect(() =>
      validateLinksForSave([manualLink(), manualLink({ id: "m2" })])
    ).toThrow(LeadBeeperLinksError);
  });

  it("rejects same-side (leadName === conversationId)", () => {
    expect(() =>
      validateLinksForSave([manualLink({ conversationId: "lead-a" })])
    ).toThrow(/itself|SAME_SIDE|cannot link/i);
  });

  it("keeps a single valid manual link", () => {
    const out = validateLinksForSave([manualLink()]);
    expect(out).toHaveLength(1);
    expect(out[0].leadName).toBe("lead-a");
  });
});
