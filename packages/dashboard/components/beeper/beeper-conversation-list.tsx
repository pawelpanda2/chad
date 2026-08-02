"use client";

import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { beeperContactDisplayName } from "@/lib/beeper-contact-display";
import { BeeperPlatformIcon } from "./beeper-platform-icon";

export interface BeeperConversationListItem {
  _id: string;
  displayName: string;
  hasAvatar: boolean;
  lastMessage: { text: string; timestamp: string | null; network: string } | null;
  /** Resolved conversation platform network (DBA); preferred over guessing identities[0]. */
  platformNetwork?: string | null;
  identities?: Array<{ network?: string; senderName?: string }>;
}

interface BeeperConversationListProps {
  contacts: BeeperConversationListItem[];
  loading: boolean;
  selectedContactId: string | null;
  onSelect: (id: string) => void;
}

/**
 * Contact list for Conversations / Msg workout. Search lives in the Beeper
 * page toolbar (next to All groups), not inside this list.
 */
export function BeeperConversationList({
  contacts,
  loading,
  selectedContactId,
  onSelect,
}: BeeperConversationListProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" />
          </div>
        ) : (
          <div className="divide-y">
            {contacts.map((c) => {
              const selected = c._id === selectedContactId;
              const name = beeperContactDisplayName(c.displayName, c.identities);
              const platformNetwork =
                c.platformNetwork ?? c.lastMessage?.network ?? null;
              return (
                <button
                  key={c._id}
                  type="button"
                  onClick={() => onSelect(c._id)}
                  aria-current={selected ? "true" : undefined}
                  className={cn(
                    "flex w-full items-center gap-2 px-2.5 py-2 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                    selected && "bg-accent"
                  )}
                >
                  <BeeperPlatformIcon network={platformNetwork} size="md" className="h-7 w-7" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{name}</div>
                    {c.lastMessage ? (
                      <p className="truncate text-xs text-muted-foreground">
                        {c.lastMessage.text}
                      </p>
                    ) : (
                      <p className="truncate text-xs italic text-muted-foreground/60">
                        No messages
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
