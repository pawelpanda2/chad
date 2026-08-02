"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  getBeeperPlatformMeta,
  normalizeBeeperNetwork,
  type BeeperPlatformKey,
} from "dba/beeper-platform";

interface BeeperPlatformIconProps {
  /** Raw Beeper `network` (bridge id or short alias). */
  network?: string | null;
  size?: "sm" | "md";
  className?: string;
}

const SIZE = { sm: "h-4 w-4", md: "h-5 w-5" } as const;

/** Brand-ish colors that stay readable in light and dark mode. */
const PLATFORM_COLOR: Record<BeeperPlatformKey, string> = {
  whatsapp: "text-[#25D366]",
  instagram: "text-[#E4405F]",
  telegram: "text-[#2AABEE]",
  facebook: "text-[#1877F2]",
  signal: "text-[#3A76F0]",
  sms: "text-emerald-600 dark:text-emerald-400",
  imessage: "text-[#34C759]",
  unknown: "text-muted-foreground",
};

/** Compact local SVGs — no external URLs, no heavy icon pack. */
function PlatformGlyph({ platform }: { platform: BeeperPlatformKey }) {
  const common = "h-full w-full";
  switch (platform) {
    case "whatsapp":
      return (
        <svg viewBox="0 0 24 24" className={common} aria-hidden="true">
          <path
            fill="currentColor"
            d="M12 2C6.5 2 2 6.3 2 11.6c0 1.9.5 3.7 1.5 5.3L2 22l5.3-1.4c1.5.8 3.2 1.3 4.7 1.3 5.5 0 10-4.3 10-9.6S17.5 2 12 2zm0 17.5c-1.4 0-2.8-.4-4-1.1l-.3-.2-3.1.8.8-3-.2-.3c-.8-1.2-1.2-2.6-1.2-4.1 0-4.2 3.6-7.6 8-7.6s8 3.4 8 7.6-3.6 7.9-8 7.9zm4.4-5.7c-.2-.1-1.4-.7-1.6-.8-.2-.1-.4-.1-.5.1-.2.2-.6.8-.7.9-.1.2-.3.2-.5.1-.2-.1-.9-.3-1.8-1.1-.7-.6-1.1-1.3-1.3-1.5-.1-.2 0-.3.1-.4.1-.1.2-.3.3-.4.1-.1.1-.2.2-.4 0-.1 0-.3 0-.4 0-.1-.5-1.3-.7-1.7-.2-.5-.4-.4-.5-.4h-.4c-.2 0-.4.1-.6.3-.2.2-.8.8-.8 1.9s.8 2.2.9 2.3c.1.2 1.6 2.5 3.9 3.4 1.5.6 2 .6 2.7.5.4-.1 1.4-.6 1.6-1.1.2-.5.2-1 .1-1.1-.1-.1-.2-.2-.4-.3z"
          />
        </svg>
      );
    case "instagram":
      return (
        <svg viewBox="0 0 24 24" className={common} aria-hidden="true">
          <path
            fill="currentColor"
            d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5zm0 2a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H7zm11 1.5a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4zM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"
          />
        </svg>
      );
    case "telegram":
      return (
        <svg viewBox="0 0 24 24" className={common} aria-hidden="true">
          <path
            fill="currentColor"
            d="M9.4 15.5 9.2 19c.4 0 .6-.2.8-.4l1.9-1.8 4 2.9c.7.4 1.3.2 1.5-.7L21.8 5c.3-1.1-.4-1.6-1.1-1.3L3.3 10.2c-1 .4-1 1-.2 1.3l4.3 1.3 10-6.3c.5-.3.9-.1.5.2"
          />
        </svg>
      );
    case "facebook":
      return (
        <svg viewBox="0 0 24 24" className={common} aria-hidden="true">
          <path
            fill="currentColor"
            d="M13.5 22v-8h2.7l.4-3.1h-3.1V8.9c0-.9.3-1.5 1.6-1.5H17V4.6c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 4v2.4H8v3.1h2.8V22h2.7z"
          />
        </svg>
      );
    case "signal":
      return (
        <svg viewBox="0 0 24 24" className={common} aria-hidden="true">
          <path
            fill="currentColor"
            d="M12 2a9.5 9.5 0 0 0-8.3 14.1L3 21l5.1-.7A9.5 9.5 0 1 0 12 2zm0 2a7.5 7.5 0 0 1 6.4 11.4l.3.5-.4.2c-.2.1-.5.1-.7.2l-.5.1A7.5 7.5 0 0 1 5.5 12 7.5 7.5 0 0 1 12 4zm-3.2 4.8c.2-.1.5-.1.6.2l.7 1.6c.1.2 0 .4-.1.5l-.4.4c.6 1.2 1.6 2.1 2.8 2.7l.5-.4c.2-.1.4-.2.6 0l1.5.7c.2.1.3.4.1.6-.5.8-1.4 1.2-2.3 1.1-2.6-.3-4.8-2.5-5.2-5.1-.1-.8.2-1.6.8-2.1.1 0 .2-.1.4-.2z"
          />
        </svg>
      );
    case "sms":
      return (
        <svg viewBox="0 0 24 24" className={common} aria-hidden="true">
          <path
            fill="currentColor"
            d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8l-4 3v-3H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm3 5v2h10V9H7zm0 4v2h7v-2H7z"
          />
        </svg>
      );
    case "imessage":
      return (
        <svg viewBox="0 0 24 24" className={common} aria-hidden="true">
          <path
            fill="currentColor"
            d="M12 3c5.2 0 9.5 3.5 9.5 7.8S17.2 18.6 12 18.6c-.7 0-1.4-.1-2-.2L6 20.5l.7-3.1C5 15.9 2.5 13.6 2.5 10.8 2.5 6.5 6.8 3 12 3z"
          />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" className={common} aria-hidden="true">
          <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2" />
          <circle cx="12" cy="12" r="2.5" fill="currentColor" />
        </svg>
      );
  }
}

/**
 * Small platform mark for Beeper contact/conversation rows. Driven only by
 * a real `network` value (via dba `normalizeBeeperNetwork`) — never by the
 * contact's display-name initial.
 *
 * Clicking it shows the full platform name (e.g. "WhatsApp") in a small
 * bubble for ~2s, then it fades away — click only, not hover (no native
 * `title` tooltip, so it doesn't also pop up on mouseover).
 */
export function BeeperPlatformIcon({ network, size = "sm", className }: BeeperPlatformIconProps) {
  const key = normalizeBeeperNetwork(network);
  const { label } = getBeeperPlatformMeta(key);
  const [revealed, setRevealed] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function reveal(e: React.SyntheticEvent) {
    e.stopPropagation();
    setRevealed(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setRevealed(false), 2000);
  }

  return (
    <span className="relative inline-flex shrink-0">
      {/* Not a real <button>: this icon is also used inside other buttons
          (e.g. the conversation list row), and nested buttons are invalid
          HTML. role="button" keeps it click/keyboard accessible instead. */}
      <span
        role="button"
        tabIndex={0}
        onClick={reveal}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            reveal(e);
          }
        }}
        aria-label={label}
        className={cn(
          "inline-flex shrink-0 cursor-pointer items-center justify-center",
          PLATFORM_COLOR[key],
          SIZE[size],
          className
        )}
      >
        <PlatformGlyph platform={key} />
      </span>
      {revealed && (
        <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-1 -translate-x-1/2 whitespace-nowrap rounded-md border bg-popover px-1.5 py-0.5 text-[11px] text-popover-foreground shadow-md">
          {label}
        </span>
      )}
    </span>
  );
}
