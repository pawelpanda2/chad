import { describe, expect, it } from "vitest";
import { mapPersonToContact } from "google-contacts";

describe("mapPersonToContact", () => {
  it("maps a full person", () => {
    const dto = mapPersonToContact({
      resourceName: "people/c1",
      names: [{ displayName: "Ada Lovelace" }],
      phoneNumbers: [{ value: "+48 111" }, { value: "+48 222" }],
      emailAddresses: [{ value: "ada@example.com" }],
      photos: [{ url: "https://img/a", default: false }],
      organizations: [{ name: "Analytical Engine", title: "Mathematician" }],
    });
    expect(dto).toEqual({
      resourceName: "people/c1",
      displayName: "Ada Lovelace",
      phones: ["+48 111", "+48 222"],
      emails: ["ada@example.com"],
      photoUrl: "https://img/a",
      organizations: ["Analytical Engine · Mathematician"],
    });
  });

  it("handles missing name, phones, and emails without fabricating values", () => {
    const dto = mapPersonToContact({ resourceName: "people/c2" });
    expect(dto).toEqual({
      resourceName: "people/c2",
      displayName: null,
      phones: [],
      emails: [],
      photoUrl: null,
      organizations: [],
    });
  });

  it("dedupes phones/emails and skips blank entries", () => {
    const dto = mapPersonToContact({
      resourceName: "people/c3",
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
