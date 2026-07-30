import { describe, expect, it } from "vitest";
import {
  filterBeeperContacts,
  shouldRenderConversation,
  splitHandleProps,
} from "./beeper-conversations-logic";

describe("filterBeeperContacts", () => {
  const contacts = [
    { _id: "1", displayName: "Alice" },
    { _id: "2", displayName: "Bob" },
    { _id: "3", displayName: "alicia" },
  ];

  it("returns everything for an empty query", () => {
    expect(filterBeeperContacts(contacts, "")).toEqual(contacts);
    expect(filterBeeperContacts(contacts, "   ")).toEqual(contacts);
  });

  it("filters case-insensitively by displayName substring", () => {
    expect(filterBeeperContacts(contacts, "ali").map((c) => c._id)).toEqual(["1", "3"]);
    expect(filterBeeperContacts(contacts, "BOB").map((c) => c._id)).toEqual(["2"]);
  });

  it("returns empty array when nothing matches", () => {
    expect(filterBeeperContacts(contacts, "zzz")).toEqual([]);
  });
});

describe("splitHandleProps", () => {
  it("expanded list: ChevronLeft, collapse label", () => {
    expect(splitHandleProps(false)).toEqual({
      ariaLabel: "Collapse conversation list",
      icon: "left",
    });
  });

  it("collapsed list: ChevronRight, expand label", () => {
    expect(splitHandleProps(true)).toEqual({
      ariaLabel: "Expand conversation list",
      icon: "right",
    });
  });
});

describe("shouldRenderConversation", () => {
  it("false when no contact selected", () => {
    expect(shouldRenderConversation(null, 5)).toBe(false);
  });

  it("false when selected but conversation is empty (avoids shared renderer's own empty-state icon)", () => {
    expect(shouldRenderConversation("abc", 0)).toBe(false);
  });

  it("true only when a contact is selected and has messages", () => {
    expect(shouldRenderConversation("abc", 1)).toBe(true);
  });
});
