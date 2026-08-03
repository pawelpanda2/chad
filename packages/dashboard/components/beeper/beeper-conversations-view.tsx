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

export interface BeeperConversationsViewProps {
  /** Restores the open conversation after a hard refresh (Story 99 follow-up) — read from the page's `?contact=` query param. */
  initialContactId?: string;
  /** Called whenever the selected contact changes (select or back-to-list), so the page can mirror it into the URL. */
  onSelectContact?: (id: string | null) => void;
  /** Story 101 — filters the contact list to one contact group; undefined/"All groups" shows everyone. */
  groupFilter?: string;
  /** Search query from the page toolbar (next to All groups). */
  query?: string;
  onQueryChange?: (query: string) => void;
}

/**
 * Beeper Conversations split-view (Story 94): contact list | handle |
 * conversation. Selecting a contact loads its messages inline — never
 * navigates to /dashboard/beeper/[id].
 *
 * Deliberately plain — just the Beeper messages, nothing else. The msg
 * workout linking/review UI (Story 99) lives in its own "Msg workout" tab
 * (`msg-workout-review-view.tsx`), not here, per explicit direction:
 * Conversations should stay a simple message browser.
 *
 * Contact list (`aside`) and conversation (`section`) each own their
 * scroll and fill the available height (`h-full` from beeper/page.tsx's
 * `flex-1 min-h-0` pane). There is no page/shell vertical scrollbar —
 * height for these panes is recovered by collapsing the Beeper tabs/
 * filters chevron on the page, not by scrolling the shell.
 */
export function BeeperConversationsView({
  initialContactId,
  onSelectContact,
  groupFilter,
  query = "",
}: BeeperConversationsViewProps = {}) {
  const [contacts, setContacts] = useState<BeeperConversationListItem[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [isListCollapsed, setIsListCollapsed] = useState(false);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [conversationMessages, setConversationMessages] = useState<ParsedWhatsAppMessage[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const conversationScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingContacts(true);
    const qs = groupFilter ? `?groupId=${encodeURIComponent(groupFilter)}` : "";
    fetch(`/api/beeper-crm/contacts${qs}`)
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
  }, [groupFilter]);

  const selectContact = useCallback(
    (id: string) => {
      setSelectedContactId(id);
      setLoadingConversation(true);
      setConversationMessages([]);
      onSelectContact?.(id);
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
    },
    [onSelectContact]
  );

  const clearSelection = useCallback(() => {
    setSelectedContactId(null);
    onSelectContact?.(null);
  }, [onSelectContact]);

  // Restore the previously open conversation after a hard refresh — see
  // BeeperConversationsViewProps.initialContactId. Intentionally only on
  // mount (empty deps): this is a one-time restore, not a live sync with
  // the URL (selectContact/clearSelection already push changes the other way).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (initialContactId) selectContact(initialContactId);
  }, []);

  useEffect(() => {
    // scrollTop on the conversation pane only — never scrollIntoView()
    // (walks every scrollable ancestor).
    if (conversationScrollRef.current && conversationMessages.length > 0) {
      conversationScrollRef.current.scrollTop = conversationScrollRef.current.scrollHeight;
    }
  }, [conversationMessages]);

  const filtered = filterBeeperContacts(contacts, query);
  const showConversation = shouldRenderConversation(selectedContactId, conversationMessages.length);
  const hasSelection = Boolean(selectedContactId);

  return (
    <div className="flex h-full min-h-0 w-full">
      <aside
        className={cn(
          "flex min-h-0 w-full flex-col border-r transition-[width] duration-150",
          // Desktop-only collapse; mobile visibility is selection-driven instead (below).
          isListCollapsed ? "md:w-0 md:border-transparent" : "md:w-[300px]",
          // Mobile: hide the list once a contact is open (full-screen conversation).
          hasSelection && "hidden md:flex"
        )}
      >
        <BeeperConversationList
          contacts={filtered}
          loading={loadingContacts}
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
          "relative min-h-0 min-w-0 flex-1 overflow-hidden rounded-xl border",
          // Mobile: hide the conversation until a contact is selected.
          !hasSelection && "hidden md:block"
        )}
      >
        {hasSelection && (
          <button
            type="button"
            onClick={clearSelection}
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
          <div ref={conversationScrollRef} className="h-full overflow-y-auto">
            <BeeperConversationView messages={conversationMessages} endRef={messagesEndRef} />
          </div>
        ) : (
          <div className="h-full" />
        )}
      </section>
    </div>
  );
}
