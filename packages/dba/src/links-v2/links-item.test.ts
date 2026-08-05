import { describe, expect, it } from "vitest";
import {
  parseLeadLinksYaml,
  dumpLeadLinksYaml,
  mergeBeeperEntries,
  mergeGoogleContactsEntries,
} from "./links-item.js";
import type { BeeperLinkEntry, GoogleContactsLinkEntry } from "./types.js";

function beeperEntry(chatId: string, type = "whatsapp"): BeeperLinkEntry {
  return { chatId, type, method: "automatic", matchedOn: "phone", updatedAt: "2026-08-05T05:00:00.000Z" };
}

function gcEntry(resourceName: string): GoogleContactsLinkEntry {
  return {
    resourceName,
    displayName: "Anna Kowalska",
    phone: "+48 600 123 456",
    method: "automatic",
    matchedOn: "phone",
    updatedAt: "2026-08-05T05:00:00.000Z",
  };
}

describe("parseLeadLinksYaml / dumpLeadLinksYaml", () => {
  it("round-trips beeper + googleContacts entries", () => {
    const data = { beeper: [beeperEntry("chat1"), beeperEntry("chat2", "instagram")], googleContacts: [gcEntry("people/c1")] };
    const body = dumpLeadLinksYaml(data);
    const parsed = parseLeadLinksYaml(body);
    expect(parsed).toEqual(data);
  });

  it("returns empty arrays for an empty body", () => {
    expect(parseLeadLinksYaml("")).toEqual({ beeper: [], googleContacts: [] });
  });

  it("returns empty arrays for malformed YAML instead of throwing", () => {
    expect(parseLeadLinksYaml("beeper: [unclosed")).toEqual({ beeper: [], googleContacts: [] });
  });

  it("dumps an empty body when there is nothing linked yet", () => {
    expect(dumpLeadLinksYaml({ beeper: [], googleContacts: [] })).toBe("");
  });

  it("drops entries missing their required key", () => {
    const parsed = parseLeadLinksYaml("beeper:\n  - type: whatsapp\ngoogleContacts:\n  - displayName: X\n");
    expect(parsed).toEqual({ beeper: [], googleContacts: [] });
  });
});

describe("mergeBeeperEntries", () => {
  it("keeps multiple distinct chats for one lead", () => {
    const { merged, addedCount } = mergeBeeperEntries([], [beeperEntry("chat1"), beeperEntry("chat2")]);
    expect(merged.map((e) => e.chatId)).toEqual(["chat1", "chat2"]);
    expect(addedCount).toBe(2);
  });

  it("never adds a duplicate chatId", () => {
    const existing = [beeperEntry("chat1")];
    const { merged, addedCount } = mergeBeeperEntries(existing, [beeperEntry("chat1"), beeperEntry("chat2")]);
    expect(merged.map((e) => e.chatId)).toEqual(["chat1", "chat2"]);
    expect(addedCount).toBe(1);
  });

  it("re-running the same merge twice adds nothing the second time", () => {
    const first = mergeBeeperEntries([], [beeperEntry("chat1")]);
    const second = mergeBeeperEntries(first.merged, [beeperEntry("chat1")]);
    expect(second.merged).toHaveLength(1);
    expect(second.addedCount).toBe(0);
  });
});

describe("mergeGoogleContactsEntries", () => {
  it("keeps multiple distinct contacts and dedups by resourceName", () => {
    const { merged, addedCount } = mergeGoogleContactsEntries(
      [gcEntry("people/c1")],
      [gcEntry("people/c1"), gcEntry("people/c2")]
    );
    expect(merged.map((e) => e.resourceName)).toEqual(["people/c1", "people/c2"]);
    expect(addedCount).toBe(1);
  });
});

describe("multiple providers for one lead", () => {
  it("a lead can hold both beeper and googleContacts entries at once", () => {
    const data = { beeper: [beeperEntry("chat1")], googleContacts: [gcEntry("people/c1")] };
    const body = dumpLeadLinksYaml(data);
    expect(body).toContain("beeper:");
    expect(body).toContain("googleContacts:");
    expect(parseLeadLinksYaml(body)).toEqual(data);
  });
});
