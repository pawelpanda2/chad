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
import { MsgWorkoutMarker } from "./msg-workout-marker";
import { MsgWorkoutPanel } from "./msg-workout-panel";
import { UndatedMsgWorkouts } from "./undated-msg-workouts";
import type { MsgWorkoutConversationLinksResponse, MsgWorkoutEntry, MsgWorkoutProposalEntry } from "./msg-workout-types";

const EMPTY_WORKOUT_LINKS: MsgWorkoutConversationLinksResponse = {
  leadName: null,
  linksByMessageId: {},
  proposalsByMessageId: {},
  undated: [],
};

export interface MsgWorkoutReviewViewProps {
  /** Restores the open conversation after a hard refresh — read from the page's `?contact=` query param. */
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
 * Msg workout ↔ Beeper linking review (Story 99) — its own tab, separate
 * from the plain "Conversations" tab (`beeper-conversations-view.tsx`),
 * per explicit direction: Conversations stays a simple message browser,
 * this tab is where the msg-workout marker/proposal/sync workflow lives.
 * Structurally a sibling of BeeperConversationsView (same contact list +
 * conversation split-view), extended with the workout review pane.
 *
 * Same split-view scrollbar design as BeeperConversationsView (see
 * ai-docs/gui-standard/ai-start.md) — same reasoning.
 */
export function MsgWorkoutReviewView({
  initialContactId,
  onSelectContact,
  groupFilter,
  query = "",
}: MsgWorkoutReviewViewProps = {}) {
  const [contacts, setContacts] = useState<BeeperConversationListItem[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [isListCollapsed, setIsListCollapsed] = useState(false);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [conversationMessages, setConversationMessages] = useState<ParsedWhatsAppMessage[]>([]);
  const [workoutLinks, setWorkoutLinks] = useState<MsgWorkoutConversationLinksResponse>(EMPTY_WORKOUT_LINKS);
  const [loadingWorkoutLinks, setLoadingWorkoutLinks] = useState(false);
  const [expandedWorkout, setExpandedWorkout] = useState<MsgWorkoutEntry | MsgWorkoutProposalEntry | null>(null);
  const [syncingWorkouts, setSyncingWorkouts] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const conversationScrollRef = useRef<HTMLDivElement>(null);

  const fetchWorkoutLinks = useCallback((conversationId: string) => {
    setLoadingWorkoutLinks(true);
    fetch(`/api/msg-workout/conversation-links?conversationId=${encodeURIComponent(conversationId)}`)
      .then((res) => (res.ok ? res.json() : EMPTY_WORKOUT_LINKS))
      .then((data: MsgWorkoutConversationLinksResponse) => {
        setWorkoutLinks({
          leadName: data?.leadName ?? null,
          linksByMessageId: data?.linksByMessageId ?? {},
          proposalsByMessageId: data?.proposalsByMessageId ?? {},
          undated: Array.isArray(data?.undated) ? data.undated : [],
        });
      })
      .catch(() => setWorkoutLinks(EMPTY_WORKOUT_LINKS))
      .finally(() => setLoadingWorkoutLinks(false));
  }, []);

  const handleSyncWorkouts = useCallback(() => {
    if (!workoutLinks.leadName || !selectedContactId) return;
    setSyncingWorkouts(true);
    fetch("/api/msg-workout/analyze-lead", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadName: workoutLinks.leadName }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error || `Sync failed: ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        const s = data?.summary;
        toast.success(
          s ? `Synced: ${s.linked} linked, ${s.proposals} proposals, ${s.undated} undated` : "Synced"
        );
        fetchWorkoutLinks(selectedContactId);
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : "Failed to sync msg workouts");
      })
      .finally(() => setSyncingWorkouts(false));
  }, [workoutLinks.leadName, selectedContactId, fetchWorkoutLinks]);

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
      setWorkoutLinks(EMPTY_WORKOUT_LINKS);
      setExpandedWorkout(null);
      onSelectContact?.(id);
      fetchWorkoutLinks(id);
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
    [fetchWorkoutLinks, onSelectContact]
  );

  const clearSelection = useCallback(() => {
    setSelectedContactId(null);
    onSelectContact?.(null);
  }, [onSelectContact]);

  // One-time restore on mount — see MsgWorkoutReviewViewProps.initialContactId.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (initialContactId) selectContact(initialContactId);
  }, []);

  useEffect(() => {
    // scrollTop on the local container directly — see BeeperConversationsView
    // for why (scrollIntoView climbs every scrollable ancestor, including
    // the page shell's, which visibly collapsed the tabs).
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
          // Opening a msg workout also force-collapses the list (freeing width
          // for the workout panel) — closing it restores whatever the user's
          // own manual collapse preference was.
          isListCollapsed || expandedWorkout ? "md:w-0 md:border-transparent" : "md:w-[300px]",
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

      {/* Opening a workout force-collapses the list regardless of this
          handle's own toggle state (see `isListCollapsed || expandedWorkout`
          above), so the handle would flip a state that has no visible
          effect — confusing, looked broken. Hidden while a workout is open;
          the panel's own X close (below) is the only way back. */}
      {!expandedWorkout && (
        <BeeperSplitHandle
          isListCollapsed={isListCollapsed}
          onClick={() => setIsListCollapsed((v) => !v)}
          className="my-auto hidden shrink-0 self-center md:flex"
        />
      )}

      <section
        className={cn(
          "relative flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-xl border",
          !hasSelection && "hidden md:flex"
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
        {hasSelection && !expandedWorkout && (loadingWorkoutLinks || syncingWorkouts || workoutLinks.leadName) && (
          <button
            type="button"
            onClick={handleSyncWorkouts}
            disabled={syncingWorkouts || loadingWorkoutLinks || !workoutLinks.leadName}
            aria-label="Sync msg workouts"
            title={loadingWorkoutLinks ? "Loading msg workouts…" : syncingWorkouts ? "Syncing…" : "Sync msg workouts"}
            className="absolute right-1.5 top-1.5 z-10 flex h-7 w-7 items-center justify-center rounded-full border bg-card text-muted-foreground shadow-sm hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            <RefreshCw className={cn("h-4 w-4", (syncingWorkouts || loadingWorkoutLinks) && "animate-spin")} />
          </button>
        )}
        {loadingConversation ? (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" />
          </div>
        ) : showConversation ? (
          <>
            <div className={cn("flex h-full min-h-0 min-w-0 flex-1 flex-col", expandedWorkout && "hidden md:flex")}>
              <UndatedMsgWorkouts entries={workoutLinks.undated} onOpen={setExpandedWorkout} />
              <div ref={conversationScrollRef} className="min-h-0 flex-1 overflow-y-auto">
                <BeeperConversationView
                  messages={conversationMessages}
                  endRef={messagesEndRef}
                  showActions
                  renderMessageAction={(msg) => (
                    <MsgWorkoutMarker
                      linked={msg.dbId ? workoutLinks.linksByMessageId[msg.dbId] ?? [] : []}
                      proposed={msg.dbId ? workoutLinks.proposalsByMessageId[msg.dbId] ?? [] : []}
                      onOpen={setExpandedWorkout}
                    />
                  )}
                />
              </div>
            </div>
            {expandedWorkout && (
              <div className="flex h-full w-full min-h-0 flex-col md:w-[600px] md:shrink-0 md:border-l">
                <MsgWorkoutPanel entry={expandedWorkout} onClose={() => setExpandedWorkout(null)} />
              </div>
            )}
          </>
        ) : (
          <div className="h-full w-full" />
        )}
      </section>
    </div>
  );
}
