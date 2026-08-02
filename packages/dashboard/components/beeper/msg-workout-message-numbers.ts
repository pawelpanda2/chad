import type { ParsedWhatsAppMessage } from "@/components/shared/beeper-conversation-view";
import type { MessageNumberOption } from "./msg-workout-assignment-list";

/**
 * Story 99 — GUI message numbers are 1..N in display order (top → bottom;
 * typically oldest → newest). Numbers are UI-only; assignment always uses
 * stable Mongo `dbId`.
 */
export function buildMessageNumberMaps(messages: ParsedWhatsAppMessage[]): {
  messageOptions: MessageNumberOption[];
  numberByMessageId: Map<string, number>;
} {
  const messageOptions: MessageNumberOption[] = [];
  const numberByMessageId = new Map<string, number>();
  messages.forEach((m, i) => {
    if (!m.dbId) return;
    const number = i + 1;
    messageOptions.push({ number, dbId: m.dbId });
    numberByMessageId.set(m.dbId, number);
  });
  return { messageOptions, numberByMessageId };
}

/** Resolve combobox number → stable message id (null = unlink / —). */
export function messageIdForNumber(
  messages: ParsedWhatsAppMessage[],
  messageNumber: number | null
): string | null {
  if (messageNumber === null) return null;
  return messages[messageNumber - 1]?.dbId ?? null;
}
