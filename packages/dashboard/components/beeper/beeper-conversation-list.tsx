"use client";

import { Search, RefreshCw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export interface BeeperConversationListItem {
  _id: string;
  displayName: string;
  hasAvatar: boolean;
  lastMessage: { text: string; timestamp: string | null; network: string } | null;
}

interface BeeperConversationListProps {
  contacts: BeeperConversationListItem[];
  loading: boolean;
  query: string;
  onQueryChange: (query: string) => void;
  selectedContactId: string | null;
  onSelect: (id: string) => void;
}

export function BeeperConversationList({
  contacts,
  loading,
  query,
  onQueryChange,
  selectedContactId,
  onSelect,
}: BeeperConversationListProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="relative shrink-0 p-1.5">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search"
          className="h-8 pl-7 text-sm"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" />
          </div>
        ) : (
          <div className="divide-y">
            {contacts.map((c) => {
              const selected = c._id === selectedContactId;
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
                  <Avatar className="h-7 w-7 shrink-0">
                    {c.hasAvatar && (
                      <AvatarImage
                        src={`/api/beeper-crm/contacts/${c._id}/avatar`}
                        alt={c.displayName}
                      />
                    )}
                    <AvatarFallback className="text-[10px]">
                      {c.displayName.slice(0, 1).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{c.displayName}</div>
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
