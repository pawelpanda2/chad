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
const ALL_ON = [...PILL_GROUPS, GOOGLE_CONTACTS_NO_GROUP_ID];

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

describe("filterGoogleContacts (opt-out pills)", () => {
  it("with all pills enabled shows every contact", () => {
    const out = filterGoogleContacts(CONTACTS, {
      selectedGroupIds: ALL_ON,
      pillGroupIds: PILL_GROUPS,
    });
    expect(out.map((c) => c.resourceName)).toEqual(["people/1", "people/2", "people/3", "people/4"]);
  });

  it("deselecting a label hides all contacts that carry it", () => {
    const out = filterGoogleContacts(CONTACTS, {
      selectedGroupIds: ["contactGroups/family", GOOGLE_CONTACTS_NO_GROUP_ID],
      pillGroupIds: PILL_GROUPS,
    });
    // work deselected → Ada (work) and Carol (work+family) gone; Bob + Dave remain
    expect(out.map((c) => c.resourceName)).toEqual(["people/2", "people/4"]);
  });

  it("deselecting all pills yields zero contacts", () => {
    const out = filterGoogleContacts(CONTACTS, {
      selectedGroupIds: [],
      pillGroupIds: PILL_GROUPS,
    });
    expect(out).toHaveLength(0);
  });

  it("— no group — alone keeps only ungrouped contacts", () => {
    const out = filterGoogleContacts(CONTACTS, {
      selectedGroupIds: [GOOGLE_CONTACTS_NO_GROUP_ID],
      pillGroupIds: PILL_GROUPS,
    });
    expect(out.map((c) => c.resourceName)).toEqual(["people/4"]);
  });

  it("searches by name case-insensitively", () => {
    const out = filterGoogleContacts(CONTACTS, {
      query: "ada",
      selectedGroupIds: ALL_ON,
      pillGroupIds: PILL_GROUPS,
    });
    expect(out.map((c) => c.resourceName)).toEqual(["people/1"]);
  });

  it("searches by phone", () => {
    const out = filterGoogleContacts(CONTACTS, {
      query: "500600",
      selectedGroupIds: ALL_ON,
      pillGroupIds: PILL_GROUPS,
    });
    expect(out.map((c) => c.resourceName)).toEqual(["people/2"]);
  });

  it("searches by email", () => {
    const out = filterGoogleContacts(CONTACTS, {
      query: "CAROL@X",
      selectedGroupIds: ALL_ON,
      pillGroupIds: PILL_GROUPS,
    });
    expect(out.map((c) => c.resourceName)).toEqual(["people/3"]);
  });

  it("combines search and opt-out group filters", () => {
    const out = filterGoogleContacts(CONTACTS, {
      query: "lovelace",
      selectedGroupIds: ["contactGroups/work", GOOGLE_CONTACTS_NO_GROUP_ID],
      pillGroupIds: PILL_GROUPS,
    });
    // family off → Bob/Carol out; Ada matches search + work-only among pills
    expect(out.map((c) => c.resourceName)).toEqual(["people/1"]);
  });

  it("reports visible/total via lengths", () => {
    const visible = filterGoogleContacts(CONTACTS, {
      selectedGroupIds: ALL_ON,
      pillGroupIds: PILL_GROUPS,
    });
    expect(`${visible.length} / ${CONTACTS.length} contacts`).toBe("4 / 4 contacts");
  });
});
