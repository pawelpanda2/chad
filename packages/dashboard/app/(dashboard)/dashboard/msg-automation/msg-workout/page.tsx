"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { DashboardPageShell } from "@/components/shared/dashboard-page-shell";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { MsgWorkoutReviewView } from "@/components/beeper/msg-workout-review-view";
import { BeeperGroupFilter } from "@/components/beeper/beeper-group-filter";

/**
 * Msg Auto → Msg Workout — same shared component as Beeper → Msg workout
 * (`MsgWorkoutReviewView`, no duplicated implementation). Unlike Beeper,
 * there's no Conversations/Permissions/Groups tab bar here: this page IS
 * the Msg Workout view, opened directly from the Msg Automation hub.
 *
 * Same `scroll={false}` + own-panel-scroll shell pattern as Beeper's Msg
 * workout tab — see ai-docs/gui-standard/ai-start.md.
 */
function MsgAutoMsgWorkoutPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchQuery, setSearchQuery] = useState("");
  const appliedDefaultGroupRef = useRef(false);

  const contactParam = searchParams.get("contact") ?? undefined;
  const groupParam = searchParams.get("group") ?? undefined;
  const hasOpenConversation = Boolean(contactParam);

  const updateUrl = useCallback(
    (nextContact?: string, nextGroup?: string, options?: { replace?: boolean }) => {
      const params = new URLSearchParams();
      if (nextContact) params.set("contact", nextContact);
      if (nextGroup) params.set("group", nextGroup);
      const qs = params.toString();
      const href = `/dashboard/msg-automation/msg-workout${qs ? `?${qs}` : ""}`;
      // Story 127: conversation selection is a real conceptual navigation
      // step — `push`, not `replace`, so `DashboardHistoryProvider`'s
      // `↶`/`↷` (real `router.back()`/`forward()`) have a browser
      // session-history entry to land on. Same fix, same root cause, as
      // `msg-automation/multiview/page.tsx` and `beeper/page.tsx` — this
      // page renders the same `MsgWorkoutReviewView`/conversation-select
      // shape. `replace` stays default for non-step updates (the one-time
      // default-group effect below, and group-filter changes).
      if (options?.replace) {
        router.replace(href, { scroll: false });
      } else {
        router.push(href, { scroll: false });
      }
    },
    [router]
  );

  // Same "apply the user's default group once on first mount" pattern as
  // MultiView / Links V2 — this page had the BeeperGroupFilter combobox but
  // was missing this effect, so it always started on "All groups" instead
  // of the configured default.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (appliedDefaultGroupRef.current) return;
    appliedDefaultGroupRef.current = true;
    if (searchParams.get("group")) return;
    fetch("/api/beeper-crm/groups/default")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?._id) updateUrl(contactParam, data._id, { replace: true });
      })
      .catch(() => {});
  }, []);

  const handleSelectContact = useCallback(
    (id: string | null) => updateUrl(id ?? undefined, groupParam),
    [updateUrl, groupParam]
  );

  const handleGroupChange = useCallback(
    (groupId: string | undefined) => updateUrl(undefined, groupId, { replace: true }),
    [updateUrl]
  );

  return (
    <DashboardPageShell title="Msg Workout" scroll={false}>
      <div className={cn("mb-1.5 w-full shrink-0 flex-wrap items-center gap-2", hasOpenConversation ? "hidden md:flex" : "flex")}>
        <BeeperGroupFilter value={groupParam} onChange={handleGroupChange} />
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search"
            className="h-10 w-[140px] rounded-[9px] pl-7 text-sm"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <MsgWorkoutReviewView
          initialContactId={contactParam}
          onSelectContact={handleSelectContact}
          groupFilter={groupParam}
          query={searchQuery}
          onQueryChange={setSearchQuery}
        />
      </div>
    </DashboardPageShell>
  );
}

export default function MsgAutoMsgWorkoutPage() {
  return (
    <Suspense fallback={null}>
      <MsgAutoMsgWorkoutPageInner />
    </Suspense>
  );
}
