"use client";

import { useMemo, type ReactNode } from "react";
import { MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

/** Parsed message from WhatsApp conversation */
export interface ParsedWhatsAppMessage {
  id: string;
  sender: "you" | "she" | "system";
  message: string;
  timestamp: string;
  isOwn: boolean;
  raw: string;
  /** Stable Mongo `_id` of the source message (Story 99) — only present when pre-parsed server-side via beeperMessagesToParsedMessagesWithDbId. */
  dbId?: string;
}

/**
 * Some messages contain a literal `<br>`/`<br/>`/`<br />` string (not a real
 * newline) — probably HTML-encoded at some point upstream. React escapes it
 * like any other text, so it showed up as the literal characters "<br>"
 * instead of a line break. `whitespace-pre-wrap` already turns real `\n`
 * into a visual break, so converting the literal tag to `\n` is enough —
 * no `dangerouslySetInnerHTML` needed.
 */
function normalizeMessageText(text: string): string {
  return text.replace(/<br\s*\/?>/gi, "\n");
}

/** FNV-1a 32-bit → hex — must match packages/dba/src/whatsapp-messages.ts */
function fnv1aHex(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function stableWhatsAppMessageId(
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
 *
 * ID algorithm mirrors dba/whatsapp-messages.ts (Story 85).
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

      let parsedSender: "you" | "she" | "system" = "system";
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

export interface BeeperConversationViewProps {
  content?: string | null;
  /** Prefer pre-parsed messages (stable IDs from bootstrap / DBA). */
  messages?: ParsedWhatsAppMessage[];
  emptyLabel?: string;
  emptyHint?: string;
  className?: string;
  endRef?: React.RefObject<HTMLDivElement | null>;
  /** Compact bubbles for Analysis side panel. */
  compact?: boolean;
  selectedMessageId?: string | null;
  onSelectMessage?: (messageId: string) => void;
  /** Message IDs wrapped in the red analysis context frame. */
  contextFrameIds?: string[] | null;
  /** Per-message action, rendered in the empty space on the side OPPOSITE the bubble (Beeper mode). Not shown in compact mode. */
  renderMessageAction?: (message: ParsedWhatsAppMessage) => ReactNode;
  showActions?: boolean;
  /**
   * Numbers messages 1..N (display order) and shows the number next to the
   * timestamp — after it for messages on the left (`!isOwn`, e.g.
   * "31/07/2026, 15:52:33 (2)"), before it for messages on the right
   * (`isOwn`, e.g. "(3) 31/07/2026, 15:52:33"). Msg workout tab only — lets
   * the manual-assignment list panel reference messages by a short number
   * instead of an opaque id.
   */
  showMessageNumbers?: boolean;
}

/**
 * Shared Beeper/WhatsApp conversation bubble list (Story 84/85).
 */
export function BeeperConversationView({
  content,
  messages: messagesProp,
  emptyLabel = "No conversation found",
  emptyHint,
  className,
  endRef,
  compact = false,
  selectedMessageId,
  onSelectMessage,
  contextFrameIds,
  renderMessageAction,
  showActions = false,
  showMessageNumbers = false,
}: BeeperConversationViewProps) {
  const messages = useMemo(() => {
    if (messagesProp) return messagesProp;
    return content ? parseWhatsAppMessages(content) : [];
  }, [messagesProp, content]);

  const messageNumberById = useMemo(() => {
    const map = new Map<string, number>();
    messages.forEach((m, i) => map.set(m.id, i + 1));
    return map;
  }, [messages]);

  const frameSet = useMemo(
    () => (contextFrameIds && contextFrameIds.length > 0 ? new Set(contextFrameIds) : null),
    [contextFrameIds]
  );

  if (messages.length === 0) {
    return (
      <div className={cn("flex h-full items-center justify-center", className)}>
        <div className="flex flex-col items-center gap-3 px-4 text-center text-muted-foreground">
          <MessageSquare className="h-12 w-12 opacity-20" />
          <span className="text-sm">{emptyLabel}</span>
          {emptyHint && <span className="text-xs">{emptyHint}</span>}
        </div>
      </div>
    );
  }

  const gap = compact ? "gap-2" : "gap-3";
  const pad = compact ? "p-3" : "p-5";

  type Segment =
    | { kind: "frame"; items: ParsedWhatsAppMessage[] }
    | { kind: "single"; item: ParsedWhatsAppMessage };

  const segments: Segment[] = [];
  if (!frameSet) {
    for (const m of messages) segments.push({ kind: "single", item: m });
  } else {
    let i = 0;
    while (i < messages.length) {
      if (frameSet.has(messages[i].id)) {
        const items: ParsedWhatsAppMessage[] = [];
        while (i < messages.length && frameSet.has(messages[i].id)) {
          items.push(messages[i]);
          i += 1;
        }
        segments.push({ kind: "frame", items });
      } else {
        segments.push({ kind: "single", item: messages[i] });
        i += 1;
      }
    }
  }

  function renderBubble(msg: ParsedWhatsAppMessage) {
    const selected = selectedMessageId === msg.id;
    return (
      <div
        className={cn(
          compact ? "max-w-[88%]" : "max-w-[72%]",
          "rounded-[14px] border px-3 py-2.5 text-sm leading-snug shadow-sm",
          msg.sender === "system" &&
            "mx-auto border-transparent bg-muted text-center text-xs text-muted-foreground",
          msg.isOwn && "rounded-br-sm border-primary bg-primary text-primary-foreground",
          !msg.isOwn && msg.sender !== "system" && "rounded-bl-sm border-border bg-card text-card-foreground",
          selected && !compact && "outline outline-[3px] outline-[rgba(30,110,255,0.18)] border-[#4384ff]"
        )}
      >
        <p className="whitespace-pre-wrap break-words">{normalizeMessageText(msg.message)}</p>
        {msg.timestamp &&
          (() => {
            const number = showMessageNumbers ? messageNumberById.get(msg.id) : undefined;
            const timestampText =
              number === undefined ? msg.timestamp : msg.isOwn ? `(${number}) ${msg.timestamp}` : `${msg.timestamp} (${number})`;
            return (
              <span
                className={cn(
                  "mt-1 block text-[11px] opacity-60",
                  msg.isOwn ? "text-primary-foreground" : "text-muted-foreground"
                )}
              >
                {timestampText}
              </span>
            );
          })()}
      </div>
    );
  }

  function renderRow(msg: ParsedWhatsAppMessage) {
    const action =
      showActions && !compact && renderMessageAction ? renderMessageAction(msg) : null;

    const bubbleCol = (
      <div
        className={cn(
          "flex min-w-0",
          msg.isOwn ? "justify-end" : msg.sender === "system" ? "justify-center" : "justify-start"
        )}
      >
        {renderBubble(msg)}
      </div>
    );
    const actionCol = <div className="flex items-center justify-center">{action}</div>;

    // Action renders in the space beside the bubble, on whichever side is
    // otherwise empty: own (right-aligned) messages get it on the left,
    // others (left-aligned) get it on the right — never overlapping the
    // bubble itself. Plain column order swap, not a fixed "always right"
    // slot (Story 99 follow-up — markers used to sit in a fixed right-hand
    // column regardless of bubble side, wasting the actual empty gap).
    const rowInner = msg.isOwn ? (
      <>
        {actionCol}
        {bubbleCol}
      </>
    ) : (
      <>
        {bubbleCol}
        {actionCol}
      </>
    );

    if (showActions && !compact) {
      return (
        <div
          key={msg.id}
          role={onSelectMessage ? "button" : undefined}
          tabIndex={onSelectMessage ? 0 : undefined}
          onClick={() => onSelectMessage?.(msg.id)}
          onKeyDown={(e) => {
            if (!onSelectMessage) return;
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onSelectMessage(msg.id);
            }
          }}
          className={cn(
            "grid w-full grid-cols-1 items-center gap-3",
            msg.isOwn ? "sm:grid-cols-[190px_minmax(0,1fr)]" : "sm:grid-cols-[minmax(0,1fr)_190px]",
            onSelectMessage && "cursor-pointer"
          )}
        >
          {rowInner}
        </div>
      );
    }

    return (
      <div
        key={msg.id}
        role={onSelectMessage && !compact ? "button" : undefined}
        tabIndex={onSelectMessage && !compact ? 0 : undefined}
        onClick={() => {
          if (!compact) onSelectMessage?.(msg.id);
        }}
        className={cn(
          "flex w-full",
          msg.isOwn ? "justify-end" : msg.sender === "system" ? "justify-center" : "justify-start",
          onSelectMessage && !compact && "cursor-pointer"
        )}
      >
        {renderBubble(msg)}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col", gap, pad, className)}>
      {segments.map((seg, si) => {
        if (seg.kind === "single") {
          return renderRow(seg.item);
        }
        return (
          <div
            key={`frame-${si}-${seg.items[0]?.id}`}
            className="rounded-xl border-4 border-red-600 bg-red-600/[0.03] p-2"
          >
            <div className={cn("flex flex-col", gap)}>
              {seg.items.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    "flex w-full",
                    msg.isOwn ? "justify-end" : "justify-start"
                  )}
                >
                  {renderBubble(msg)}
                </div>
              ))}
            </div>
          </div>
        );
      })}
      {endRef && <div ref={endRef} />}
    </div>
  );
}
