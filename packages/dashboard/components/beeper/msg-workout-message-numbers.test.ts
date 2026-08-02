import { describe, expect, it } from "vitest";
import type { ParsedWhatsAppMessage } from "@/components/shared/beeper-conversation-view";
import { buildMessageNumberMaps, messageIdForNumber } from "./msg-workout-message-numbers";

function msg(partial: Partial<ParsedWhatsAppMessage> & { id: string }): ParsedWhatsAppMessage {
  return {
    sender: "she",
    message: "x",
    timestamp: "01/01/2026, 12:00:00",
    isOwn: false,
    raw: "x",
    ...partial,
  };
}

describe("buildMessageNumberMaps", () => {
  it("numbers top-to-bottom by display index and maps dbId", () => {
    const messages = [
      msg({ id: "a", dbId: "mongo-a" }),
      msg({ id: "b" }), // no dbId — skipped in options
      msg({ id: "c", dbId: "mongo-c" }),
    ];
    const { messageOptions, numberByMessageId } = buildMessageNumberMaps(messages);
    expect(messageOptions).toEqual([
      { number: 1, dbId: "mongo-a" },
      { number: 3, dbId: "mongo-c" },
    ]);
    expect(numberByMessageId.get("mongo-a")).toBe(1);
    expect(numberByMessageId.get("mongo-c")).toBe(3);
  });
});

describe("messageIdForNumber", () => {
  const messages = [msg({ id: "a", dbId: "mongo-a" }), msg({ id: "b", dbId: "mongo-b" })];

  it("maps number to dbId and — to null", () => {
    expect(messageIdForNumber(messages, 1)).toBe("mongo-a");
    expect(messageIdForNumber(messages, 2)).toBe("mongo-b");
    expect(messageIdForNumber(messages, null)).toBeNull();
  });

  it("returns null when the slot has no dbId", () => {
    expect(messageIdForNumber([msg({ id: "x" })], 1)).toBeNull();
  });
});
