"use client";

import { Suspense, useCallback, useState } from "react";
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

  const contactParam = searchParams.get("contact") ?? undefined;
  const groupParam = searchParams.get("group") ?? undefined;
  const hasOpenConversation = Boolean(contactParam);

  const updateUrl = useCallback(
    (nextContact?: string, nextGroup?: string) => {
      const params = new URLSearchParams();
      if (nextContact) params.set("contact", nextContact);
      if (nextGroup) params.set("group", nextGroup);
      const qs = params.toString();
      router.replace(`/dashboard/msg-automation/msg-workout${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [router]
  );

  const handleSelectContact = useCallback(
    (id: string | null) => updateUrl(id ?? undefined, groupParam),
    [updateUrl, groupParam]
  );

  const handleGroupChange = useCallback(
    (groupId: string | undefined) => updateUrl(undefined, groupId),
    [updateUrl]
  );

  return (
    <DashboardPageShell title="Msg Workout" upLevel={{ href: "/dashboard/msg-automation" }} scroll={false}>
      <div className={cn("mb-1.5 w-full shrink-0 flex-wrap items-center gap-2", hasOpenConversation ? "hidden md:flex" : "flex")}>
        <BeeperGroupFilter value={groupParam} onChange={handleGroupChange} />
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search"
            className="h-10 w-[140px] rounded-[9px] pl-7 text-sm"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search contacts"
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
