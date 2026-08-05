import { describe, expect, it } from "vitest";
import {
  GOOGLE_CONTACTS_NO_GROUP_ID,
  filterGoogleContacts,
  type GoogleContactDto,
} from "google-contacts";

function contact(partial: Partial<GoogleContactDto> & { resourceName: string }): GoogleContactDto {
  return {
    displayName: null,
    phones: [],
    emails: [],
    photoUrl: null,
    organizations: [],
    groupResourceNames: [],
    ...partial,
  };
}

const PILL_GROUPS = ["contactGroups/work", "contactGroups/family"];

const CONTACTS: GoogleContactDto[] = [
  contact({
    resourceName: "people/1",
    displayName: "Ada Lovelace",
    phones: ["+48 111"],
    emails: ["ada@example.com"],
    groupResourceNames: ["contactGroups/myContacts", "contactGroups/work"],
  }),
  contact({
    resourceName: "people/2",
    displayName: "Bob",
    phones: ["500600700"],
    emails: ["bob@mail.test"],
    groupResourceNames: ["contactGroups/myContacts", "contactGroups/family"],
  }),
  contact({
    resourceName: "people/3",
    displayName: "Carol",
    phones: [],
    emails: ["carol@x.com"],
    groupResourceNames: ["contactGroups/myContacts", "contactGroups/work", "contactGroups/family"],
  }),
  contact({
    resourceName: "people/4",
    displayName: "Dave",
    phones: ["111"],
    emails: [],
    groupResourceNames: ["contactGroups/myContacts"],
  }),
];

describe("filterGoogleContacts", () => {
  it("filters by a single group", () => {
    const out = filterGoogleContacts(CONTACTS, {
      selectedGroupIds: ["contactGroups/work"],
      pillGroupIds: PILL_GROUPS,
    });
    expect(out.map((c) => c.resourceName)).toEqual(["people/1", "people/3"]);
  });

  it("filters by multiple groups with OR semantics", () => {
    const out = filterGoogleContacts(CONTACTS, {
      selectedGroupIds: ["contactGroups/work", "contactGroups/family"],
      pillGroupIds: PILL_GROUPS,
    });
    expect(out.map((c) => c.resourceName)).toEqual(["people/1", "people/2", "people/3"]);
  });

  it("filters — no group — as contacts outside pill groups", () => {
    const out = filterGoogleContacts(CONTACTS, {
      selectedGroupIds: [GOOGLE_CONTACTS_NO_GROUP_ID],
      pillGroupIds: PILL_GROUPS,
    });
    expect(out.map((c) => c.resourceName)).toEqual(["people/4"]);
  });

  it("searches by name case-insensitively", () => {
    const out = filterGoogleContacts(CONTACTS, { query: "ada" });
    expect(out.map((c) => c.resourceName)).toEqual(["people/1"]);
  });

  it("searches by phone", () => {
    const out = filterGoogleContacts(CONTACTS, { query: "500600" });
    expect(out.map((c) => c.resourceName)).toEqual(["people/2"]);
  });

  it("searches by email", () => {
    const out = filterGoogleContacts(CONTACTS, { query: "CAROL@X" });
    expect(out.map((c) => c.resourceName)).toEqual(["people/3"]);
  });

  it("combines search and group filters", () => {
    const out = filterGoogleContacts(CONTACTS, {
      query: "a",
      selectedGroupIds: ["contactGroups/work"],
      pillGroupIds: PILL_GROUPS,
    });
    // Ada + Carol match "a" and work; Bob has "a" in mail? bob@mail - has a; but not in work
    expect(out.map((c) => c.resourceName)).toEqual(["people/1", "people/3"]);
  });

  it("reports visible/total via lengths", () => {
    const visible = filterGoogleContacts(CONTACTS, {
      selectedGroupIds: ["contactGroups/family"],
      pillGroupIds: PILL_GROUPS,
    });
    expect(visible.length).toBe(2);
    expect(CONTACTS.length).toBe(4);
    expect(`${visible.length} / ${CONTACTS.length} contacts`).toBe("2 / 4 contacts");
  });

  it("empty selection shows all (search may still narrow)", () => {
    expect(filterGoogleContacts(CONTACTS, { selectedGroupIds: [] })).toHaveLength(4);
    expect(filterGoogleContacts(CONTACTS, { query: "no-such" })).toHaveLength(0);
  });
});
