"use client";

import { useMemo } from "react";
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
}

/**
 * Parses WhatsApp conversation text into structured messages.
 *
 * Format: [DD/MM/YYYY, HH:MM:SS] sender: message
 * - "you" = my messages (displayed on right)
 * - "she" = her messages (displayed on left)
 * - attachments: ‎<attached: filename>
 */
export function parseWhatsAppMessages(content: string): ParsedWhatsAppMessage[] {
  if (!content || typeof content !== "string") {
    return [];
  }

  const lines = content.split("\n").filter((line) => line.trim());
  const messages: ParsedWhatsAppMessage[] = [];

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

      messages.push({
        id: `${timestamp}-${sender}-${messages.length}`,
        sender: parsedSender,
        message: displayMessage,
        timestamp: timestamp.trim(),
        isOwn: parsedSender === "you",
        raw: line,
      });
    } else if (line.trim()) {
      messages.push({
        id: `system-${messages.length}`,
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
  content: string | null;
  emptyLabel?: string;
  emptyHint?: string;
  className?: string;
  /** Optional ref target for scroll-to-end (caller owns the scroll container). */
  endRef?: React.RefObject<HTMLDivElement | null>;
}

/**
 * Shared Beeper/WhatsApp conversation bubble list (Story 84 extract from Messages).
 */
export function BeeperConversationView({
  content,
  emptyLabel = "No conversation found",
  emptyHint,
  className,
  endRef,
}: BeeperConversationViewProps) {
  const messages = useMemo(
    () => (content ? parseWhatsAppMessages(content) : []),
    [content]
  );

  if (!content || messages.length === 0) {
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

  return (
    <div className={cn("space-y-3 p-4", className)}>
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={`flex ${msg.isOwn ? "justify-end" : "justify-start"}`}
        >
          <div
            className={`max-w-[70%] lg:max-w-[60%] rounded-2xl px-4 py-2.5 ${
              msg.sender === "system"
                ? "mx-auto bg-muted text-center text-xs text-muted-foreground"
                : msg.isOwn
                  ? "rounded-br-sm bg-primary text-primary-foreground"
                  : "rounded-bl-sm bg-muted text-foreground"
            }`}
          >
            <p className="whitespace-pre-wrap break-words text-sm">{msg.message}</p>
            {msg.timestamp && (
              <p
                className={`mt-1 text-[10px] ${
                  msg.isOwn ? "text-primary-foreground/70" : "text-muted-foreground"
                }`}
              >
                {msg.timestamp}
              </p>
            )}
          </div>
        </div>
      ))}
      {endRef && <div ref={endRef} />}
    </div>
  );
}
