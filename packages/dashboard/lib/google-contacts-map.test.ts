import { describe, expect, it } from "vitest";
import { mapPersonToContact } from "google-contacts";

describe("mapPersonToContact", () => {
  it("maps a full person including memberships", () => {
    const dto = mapPersonToContact({
      resourceName: "people/c1",
      names: [{ displayName: "Ada Lovelace" }],
      phoneNumbers: [{ value: "+48 111" }, { value: "+48 222" }],
      emailAddresses: [{ value: "ada@example.com" }],
      photos: [{ url: "https://img/a", default: false }],
      organizations: [{ name: "Analytical Engine", title: "Mathematician" }],
      memberships: [
        { contactGroupMembership: { contactGroupResourceName: "contactGroups/myContacts" } },
        { contactGroupMembership: { contactGroupResourceName: "contactGroups/abc" } },
        { contactGroupMembership: { contactGroupResourceName: "contactGroups/abc" } },
      ],
    });
    expect(dto).toEqual({
      resourceName: "people/c1",
      displayName: "Ada Lovelace",
      phones: ["+48 111", "+48 222"],
      emails: ["ada@example.com"],
      photoUrl: "https://img/a",
      organizations: ["Analytical Engine · Mathematician"],
      groupResourceNames: ["contactGroups/myContacts", "contactGroups/abc"],
    });
  });

  it("handles missing name, phones, emails, and groups without fabricating values", () => {
    const dto = mapPersonToContact({ resourceName: "people/c2" });
    expect(dto).toEqual({
      resourceName: "people/c2",
      displayName: null,
      phones: [],
      emails: [],
      photoUrl: null,
      organizations: [],
      groupResourceNames: [],
    });
  });

  it("maps a contact belonging to multiple groups", () => {
    const dto = mapPersonToContact({
      resourceName: "people/c3",
      names: [{ displayName: "Multi" }],
      memberships: [
        { contactGroupMembership: { contactGroupResourceName: "contactGroups/g1" } },
        { contactGroupMembership: { contactGroupResourceName: "contactGroups/g2" } },
      ],
    });
    expect(dto?.groupResourceNames).toEqual(["contactGroups/g1", "contactGroups/g2"]);
  });

  it("does not invent groups from the contact display name", () => {
    const dto = mapPersonToContact({
      resourceName: "people/c4",
      names: [{ displayName: "Work Friends" }],
    });
    expect(dto?.groupResourceNames).toEqual([]);
  });

  it("dedupes phones/emails and skips blank entries", () => {
    const dto = mapPersonToContact({
      resourceName: "people/c5",
      phoneNumbers: [{ value: "1" }, { value: "1" }, { value: "  " }, { value: "2" }],
      emailAddresses: [{ value: "a@x" }, { value: "a@x" }],
    });
    expect(dto?.phones).toEqual(["1", "2"]);
    expect(dto?.emails).toEqual(["a@x"]);
  });

  it("returns null without resourceName", () => {
    expect(mapPersonToContact({ names: [{ displayName: "X" }] })).toBeNull();
    expect(mapPersonToContact(null)).toBeNull();
  });
});
