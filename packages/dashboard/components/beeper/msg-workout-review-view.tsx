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
import { MsgWorkoutAssignmentList } from "./msg-workout-assignment-list";
import { buildMessageNumberMaps, messageIdForNumber } from "./msg-workout-message-numbers";
import { UndatedMsgWorkouts } from "./undated-msg-workouts";
import type {
  MsgWorkoutConversationLinksResponse,
  MsgWorkoutEntry,
  MsgWorkoutListEntry,
  MsgWorkoutProposalEntry,
} from "./msg-workout-types";

const EMPTY_WORKOUT_LINKS: MsgWorkoutConversationLinksResponse = {
  leadName: null,
  linksByMessageId: {},
  proposalsByMessageId: {},
  undated: [],
  allWorkouts: [],
};

function normalizeWorkoutLinks(data: Partial<MsgWorkoutConversationLinksResponse> | null | undefined): MsgWorkoutConversationLinksResponse {
  return {
    leadName: data?.leadName ?? null,
    linksByMessageId: data?.linksByMessageId ?? {},
    proposalsByMessageId: data?.proposalsByMessageId ?? {},
    undated: Array.isArray(data?.undated) ? data.undated : [],
    allWorkouts: Array.isArray(data?.allWorkouts) ? data.allWorkouts : [],
  };
}

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
  const [assigningLoca, setAssigningLoca] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const conversationScrollRef = useRef<HTMLDivElement>(null);

  const fetchWorkoutLinks = useCallback((conversationId: string) => {
    setLoadingWorkoutLinks(true);
    fetch(`/api/msg-workout/conversation-links?conversationId=${encodeURIComponent(conversationId)}`)
      .then((res) => (res.ok ? res.json() : EMPTY_WORKOUT_LINKS))
      .then((data: MsgWorkoutConversationLinksResponse) => {
        setWorkoutLinks(normalizeWorkoutLinks(data));
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
    // for why (scrollIntoView climbs every scrollable ancestor).
    if (conversationScrollRef.current && conversationMessages.length > 0) {
      conversationScrollRef.current.scrollTop = conversationScrollRef.current.scrollHeight;
    }
  }, [conversationMessages]);

  const handleAssign = useCallback(
    async (workout: MsgWorkoutListEntry, messageNumber: number | null) => {
      if (!workoutLinks.leadName || !selectedContactId) return;

      const messageId = messageIdForNumber(conversationMessages, messageNumber);
      if (messageNumber !== null && !messageId) {
        toast.error("That message has no stable id — cannot assign");
        return;
      }

      setAssigningLoca(workout.loca);
      try {
        const res = await fetch("/api/msg-workout/set-link", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            leadName: workoutLinks.leadName,
            workoutLoca: workout.loca,
            workoutName: workout.name,
            conversationId: selectedContactId,
            messageId,
          }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || json?.ok === false) {
          throw new Error(json?.error || `Assign failed (${res.status})`);
        }
        fetchWorkoutLinks(selectedContactId);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to assign msg workout");
      } finally {
        setAssigningLoca(null);
      }
    },
    [workoutLinks.leadName, selectedContactId, conversationMessages, fetchWorkoutLinks]
  );

  const filtered = filterBeeperContacts(contacts, query);
  const showConversation = shouldRenderConversation(selectedContactId, conversationMessages.length);
  const hasSelection = Boolean(selectedContactId);

  const { messageOptions, numberByMessageId } = buildMessageNumberMaps(conversationMessages);
  const rightPanelOpen = Boolean(hasSelection && showConversation && !loadingConversation);

  return (
    <div className="flex h-full min-h-0 w-full">
      <aside
        className={cn(
          "flex min-h-0 w-full flex-col border-r transition-[width] duration-150",
          // Opening a workout full-body collapses the contact list for width;
          // the assignment list keeps the contact list visible.
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

      {!expandedWorkout && (
        <BeeperSplitHandle
          isListCollapsed={isListCollapsed}
          onClick={() => setIsListCollapsed((v) => !v)}
          className="my-auto hidden shrink-0 self-center md:flex"
        />
      )}

      <section
        className={cn(
          "relative flex min-h-0 min-w-0 flex-1 overflow-hidden",
          !hasSelection && "hidden md:flex"
        )}
      >
        {hasSelection && (
          <button
            type="button"
            onClick={clearSelection}
            aria-label="Back to conversation list"
            className="absolute left-1.5 top-10 z-10 flex h-7 w-7 items-center justify-center rounded-full border bg-card text-muted-foreground shadow-sm hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
        {loadingConversation ? (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" />
          </div>
        ) : showConversation ? (
          // Full body: 50/50 Conversation | Msg workout. List stays ~198px.
          <div className="flex h-full min-h-0 w-full gap-2 overflow-hidden p-0 md:p-0">
            <div
              className={cn(
                "flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border bg-card",
                expandedWorkout ? "md:w-1/2 md:flex-1" : "min-w-0 flex-1",
                expandedWorkout && "hidden md:flex"
              )}
            >
              <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b px-[11px] text-[11px] font-semibold">
                <span>Conversation</span>
                {(loadingWorkoutLinks || syncingWorkouts || workoutLinks.leadName) && (
                  <button
                    type="button"
                    onClick={handleSyncWorkouts}
                    disabled={syncingWorkouts || loadingWorkoutLinks || !workoutLinks.leadName}
                    aria-label="Sync msg workouts"
                    title={loadingWorkoutLinks ? "Loading msg workouts…" : syncingWorkouts ? "Syncing…" : "Sync msg workouts"}
                    className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                  >
                    <RefreshCw className={cn("h-3.5 w-3.5", (syncingWorkouts || loadingWorkoutLinks) && "animate-spin")} />
                  </button>
                )}
              </div>
              <UndatedMsgWorkouts entries={workoutLinks.undated} onOpen={setExpandedWorkout} />
              <div ref={conversationScrollRef} className="min-h-0 flex-1 overflow-y-auto px-[10px] pb-5 pt-3 sm:px-[14px]">
                <BeeperConversationView
                  messages={conversationMessages}
                  endRef={messagesEndRef}
                  showActions
                  showMessageNumbers
                  className="!gap-0 !p-0"
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

            {rightPanelOpen && (
              <aside
                className={cn(
                  "flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-xl border bg-card md:shrink-0",
                  // Full body: half the workspace; list stays narrow (~198px).
                  expandedWorkout ? "md:w-1/2 md:flex-1" : "md:w-[198px]"
                )}
              >
                <div className="flex h-9 shrink-0 items-center border-b px-[11px] text-[11px] font-semibold">
                  Msg workout
                </div>
                <div className="min-h-0 flex-1 overflow-hidden">
                  {expandedWorkout ? (
                    <MsgWorkoutPanel entry={expandedWorkout} onClose={() => setExpandedWorkout(null)} />
                  ) : loadingWorkoutLinks ? (
                    <div className="flex h-full items-center justify-center text-muted-foreground">
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    </div>
                  ) : (
                    <MsgWorkoutAssignmentList
                      workouts={workoutLinks.allWorkouts}
                      messageOptions={messageOptions}
                      numberByMessageId={numberByMessageId}
                      onOpen={setExpandedWorkout}
                      onAssign={(w, n) => void handleAssign(w, n)}
                      assigningLoca={assigningLoca}
                    />
                  )}
                </div>
              </aside>
            )}
          </div>
        ) : (
          <div className="h-full w-full" />
        )}
      </section>
    </div>
  );
}
