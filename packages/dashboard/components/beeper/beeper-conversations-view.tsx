"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  BeeperConversationView,
  type ParsedWhatsAppMessage,
} from "@/components/shared/beeper-conversation-view";
import { BeeperConversationList, type BeeperConversationListItem } from "./beeper-conversation-list";
import { BeeperSplitHandle } from "./beeper-split-handle";
import { filterBeeperContacts, shouldRenderConversation } from "./beeper-conversations-logic";

/**
 * Beeper Conversations split-view (Story 94): contact list | handle |
 * conversation. Selecting a contact loads its messages inline — never
 * navigates to /dashboard/beeper/[id].
 */
export function BeeperConversationsView() {
  const [contacts, setContacts] = useState<BeeperConversationListItem[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [query, setQuery] = useState("");
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [isListCollapsed, setIsListCollapsed] = useState(false);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [conversationMessages, setConversationMessages] = useState<ParsedWhatsAppMessage[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingContacts(true);
    fetch("/api/beeper-crm/contacts")
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load contacts: ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setContacts(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        if (!cancelled) toast.error(err instanceof Error ? err.message : "Failed to load contacts");
      })
      .finally(() => {
        if (!cancelled) setLoadingContacts(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectContact = useCallback((id: string) => {
    setSelectedContactId(id);
    setLoadingConversation(true);
    setConversationMessages([]);
    fetch(`/api/beeper-crm/contacts/${id}`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error || `Failed to load conversation: ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        setConversationMessages(
          Array.isArray(data?.conversationMessages) ? data.conversationMessages : []
        );
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : "Failed to load conversation");
      })
      .finally(() => setLoadingConversation(false));
  }, []);

  useEffect(() => {
    if (messagesEndRef.current && conversationMessages.length > 0) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [conversationMessages]);

  const filtered = filterBeeperContacts(contacts, query);
  const showConversation = shouldRenderConversation(selectedContactId, conversationMessages.length);
  const hasSelection = Boolean(selectedContactId);

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden">
      <aside
        className={cn(
          "flex min-h-0 w-full flex-col overflow-hidden border-r transition-[width] duration-150",
          // Desktop-only collapse; mobile visibility is selection-driven instead (below).
          isListCollapsed ? "md:w-0 md:border-transparent" : "md:w-[300px]",
          // Mobile: hide the list once a contact is open (full-screen conversation).
          hasSelection && "hidden md:flex"
        )}
      >
        <BeeperConversationList
          contacts={filtered}
          loading={loadingContacts}
          query={query}
          onQueryChange={setQuery}
          selectedContactId={selectedContactId}
          onSelect={selectContact}
        />
      </aside>

      <BeeperSplitHandle
        isListCollapsed={isListCollapsed}
        onClick={() => setIsListCollapsed((v) => !v)}
        className="my-auto hidden shrink-0 self-center md:flex"
      />

      <section
        className={cn(
          "relative min-w-0 flex-1 overflow-hidden",
          // Mobile: hide the conversation until a contact is selected.
          !hasSelection && "hidden md:block"
        )}
      >
        {hasSelection && (
          <button
            type="button"
            onClick={() => setSelectedContactId(null)}
            aria-label="Back to conversation list"
            className="absolute left-1.5 top-1.5 z-10 flex h-7 w-7 items-center justify-center rounded-full border bg-card text-muted-foreground shadow-sm hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
        {loadingConversation ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" />
          </div>
        ) : showConversation ? (
          <div className="h-full overflow-y-auto">
            <BeeperConversationView messages={conversationMessages} endRef={messagesEndRef} />
          </div>
        ) : (
          <div className="h-full" />
        )}
      </section>
    </div>
  );
}
