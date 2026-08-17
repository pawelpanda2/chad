/**
 * Pure unit tests for the msg workout structured entry composer (v11 GUI
 * expansion). No I/O — see appendMsgWorkoutEntryAndSave for the CP-backed
 * write path, exercised the same way other dba writes are (getItem → Put).
 */
import { describe, expect, it } from "vitest";
import { appendMsgWorkoutEntry } from "./msg-workout-entry.js";

describe("appendMsgWorkoutEntry — dash", () => {
  it("creates a //you section when the body has none", () => {
    expect(appendMsgWorkoutEntry("", { type: "dash", text: "hey" })).toBe("//you\n- hey");
  });

  it("appends a //you section after existing content", () => {
    expect(appendMsgWorkoutEntry("//she\nhello", { type: "dash", text: "hey" })).toBe(
      "//she\nhello\n\n//you\n- hey"
    );
  });

  it("appends a new bullet inside an existing //you section at EOF", () => {
    expect(appendMsgWorkoutEntry("//you\n- first", { type: "dash", text: "second" })).toBe(
      "//you\n- first\n- second"
    );
  });

  it("inserts before the next header, not after trailing sections", () => {
    const body = "//you\n- first\n\n//she\nreply";
    expect(appendMsgWorkoutEntry(body, { type: "dash", text: "second" })).toBe(
      "//you\n- first\n- second\n\n//she\nreply"
    );
  });

  it("trims the entered text and ignores empty submissions", () => {
    expect(appendMsgWorkoutEntry("//you\n- first", { type: "dash", text: "  second  " })).toBe(
      "//you\n- first\n- second"
    );
    expect(appendMsgWorkoutEntry("//you\n- first", { type: "dash", text: "   " })).toBe("//you\n- first");
  });
});

describe("appendMsgWorkoutEntry — ver", () => {
  it("appends a new //v1 block preserving internal formatting (first version)", () => {
    expect(appendMsgWorkoutEntry("//you\n- draft", { type: "ver", text: "Line one\n  indented\nLine two" })).toBe(
      "//you\n- draft\n\n//v1\nLine one\n  indented\nLine two"
    );
  });

  it("works on an empty body", () => {
    expect(appendMsgWorkoutEntry("", { type: "ver", text: "Full text" })).toBe("//v1\nFull text");
  });

  it("ignores an all-whitespace submission", () => {
    expect(appendMsgWorkoutEntry("//you\n- draft", { type: "ver", text: "   \n  " })).toBe("//you\n- draft");
  });

  it("increments to //v2 when a //v1 block already exists", () => {
    const body = "//v1\nFirst version";
    expect(appendMsgWorkoutEntry(body, { type: "ver", text: "Second version" })).toBe(
      "//v1\nFirst version\n\n//v2\nSecond version"
    );
  });

  it("increments to //v3 based on the highest existing //vN, not the count", () => {
    const body = "//v1\nfirst\n\n//v3\nthird";
    expect(appendMsgWorkoutEntry(body, { type: "ver", text: "fourth" })).toBe(
      "//v1\nfirst\n\n//v3\nthird\n\n//v4\nfourth"
    );
  });

  it("never overwrites a previous version — both blocks remain intact after two saves", () => {
    let body = appendMsgWorkoutEntry("", { type: "ver", text: "v1 text" });
    body = appendMsgWorkoutEntry(body, { type: "ver", text: "v2 text" });
    expect(body).toBe("//v1\nv1 text\n\n//v2\nv2 text");
  });

  it("treats a legacy un-numbered //ver header as an existing v1", () => {
    const body = "//ver\nLegacy version";
    expect(appendMsgWorkoutEntry(body, { type: "ver", text: "New version" })).toBe(
      "//ver\nLegacy version\n\n//v2\nNew version"
    );
  });
});

describe("appendMsgWorkoutEntry — advice", () => {
  it("appends a new //advice <author> block", () => {
    expect(appendMsgWorkoutEntry("//you\n- draft", { type: "advice", author: "Kamil_S", text: "Try shorter." })).toBe(
      "//you\n- draft\n\n//advice Kamil_S\nTry shorter."
    );
  });

  it("falls back to the default author when blank", () => {
    expect(appendMsgWorkoutEntry("", { type: "advice", author: "  ", text: "Try shorter." })).toBe(
      "//advice Kamil_S\nTry shorter."
    );
  });

  it("supports a custom author name (combobox free-text)", () => {
    expect(appendMsgWorkoutEntry("", { type: "advice", author: "Ola_N", text: "Nice." })).toBe(
      "//advice Ola_N\nNice."
    );
  });
});
