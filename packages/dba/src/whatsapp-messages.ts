/**
 * Pure WhatsApp conversation parse + stable message IDs (Story 85).
 * No Node/crypto — safe to mirror in the Dashboard client parser.
 */

export type WhatsAppSender = "you" | "she" | "system";

export interface ParsedWhatsAppMessage {
  id: string;
  sender: WhatsAppSender;
  message: string;
  timestamp: string;
  isOwn: boolean;
  raw: string;
}

/** FNV-1a 32-bit → hex (deterministic, no Node crypto). */
export function fnv1aHex(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * Stable message id from timestamp + sender + raw line.
 * Occurrence suffix only when the same key appears again in one body.
 */
export function stableWhatsAppMessageId(
  timestamp: string,
  sender: string,
  raw: string,
  occurrence: number
): string {
  const base = fnv1aHex(`${timestamp}|${sender}|${raw}`);
  return occurrence <= 1 ? base : `${base}-${occurrence}`;
}

/**
 * Parses WhatsApp conversation text into structured messages.
 * Format: [DD/MM/YYYY, HH:MM:SS] sender: message
 */
export function parseWhatsAppMessages(content: string): ParsedWhatsAppMessage[] {
  if (!content || typeof content !== "string") {
    return [];
  }

  const lines = content.split("\n").filter((line) => line.trim());
  const messages: ParsedWhatsAppMessage[] = [];
  const occurrenceByKey = new Map<string, number>();

  const messagePattern =
    /\[(\d{2}\/\d{2}\/\d{4},\s*\d{2}:\d{2}:\d{2})\]\s*(\w+):\s*(.*)/;

  for (const line of lines) {
    const match = line.match(messagePattern);

    if (match) {
      const [, timestamp, sender, messageText] = match;
      const normalizedSender = sender.toLowerCase();

      let parsedSender: WhatsAppSender = "system";
      if (normalizedSender === "you") {
        parsedSender = "you";
      } else if (normalizedSender === "she") {
        parsedSender = "she";
      }

      const attachmentMatch = messageText.match(/‎<attached:\s*(.+)>/);
      let displayMessage = messageText;
      if (attachmentMatch) {
        displayMessage = `📎 Attachment: ${attachmentMatch[1]}`;
      }

      const key = `${timestamp.trim()}|${sender}|${line}`;
      const occurrence = (occurrenceByKey.get(key) ?? 0) + 1;
      occurrenceByKey.set(key, occurrence);

      messages.push({
        id: stableWhatsAppMessageId(timestamp.trim(), sender, line, occurrence),
        sender: parsedSender,
        message: displayMessage,
        timestamp: timestamp.trim(),
        isOwn: parsedSender === "you",
        raw: line,
      });
    } else if (line.trim()) {
      const key = `system|${line.trim()}`;
      const occurrence = (occurrenceByKey.get(key) ?? 0) + 1;
      occurrenceByKey.set(key, occurrence);
      messages.push({
        id: stableWhatsAppMessageId("", "system", line.trim(), occurrence),
        sender: "system",
        message: line.trim(),
        timestamp: "",
        isOwn: false,
        raw: line,
      });
    }
  }

  return messages;
}

/**
 * Message IDs included in the Analysis red context frame for a target message.
 */
export function analysisContextMessageIds(
  messages: ParsedWhatsAppMessage[],
  targetMessageId: string
): string[] {
  const idx = messages.findIndex((m) => m.id === targetMessageId);
  if (idx < 0) return [];

  const target = messages[idx];
  if (target.sender === "she") {
    let start = idx;
    while (start > 0 && messages[start - 1].sender === "she") {
      start -= 1;
    }
    return messages.slice(start, idx + 1).map((m) => m.id);
  }

  if (target.sender === "you") {
    const framed: string[] = [];
    let i = idx - 1;
    while (i >= 0 && messages[i].sender === "she") {
      framed.unshift(messages[i].id);
      i -= 1;
    }
    framed.push(target.id);
    return framed;
  }

  return [target.id];
}

export interface PromptVersionOption {
  value: string;
  label: string;
  /** True for the synthetic Open (N) entry */
  isOpen: boolean;
  promptVersionId: string | null;
  count: number;
}

/**
 * Single source for per-message and top prompt-version comboboxes.
 * Sort: counts > 0 descending, then zeros; config order as tie-breaker.
 */
export function buildMessagePromptVersionOptions(
  versions: Array<{ id: string; displayName: string; order: number }>,
  countsByVersionId: Record<string, number>
): PromptVersionOption[] {
  const rows = versions.map((v) => ({
    id: v.id,
    displayName: v.displayName,
    order: v.order,
    count: countsByVersionId[v.id] ?? 0,
  }));

  rows.sort((a, b) => {
    const aPos = a.count > 0 ? 1 : 0;
    const bPos = b.count > 0 ? 1 : 0;
    if (aPos !== bPos) return bPos - aPos;
    if (a.count !== b.count) return b.count - a.count;
    return a.order - b.order;
  });

  const sum = rows.reduce((acc, r) => acc + (r.count > 0 ? r.count : 0), 0);
  const options: PromptVersionOption[] = [
    {
      value: "__open__",
      label: `Open (${sum})`,
      isOpen: true,
      promptVersionId: null,
      count: sum,
    },
  ];

  for (const r of rows) {
    options.push({
      value: r.id,
      label: `${r.displayName} (${r.count})`,
      isOpen: false,
      promptVersionId: r.id,
      count: r.count,
    });
  }

  return options;
}
