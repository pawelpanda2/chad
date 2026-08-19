"use client";

import { useRouter } from "next/navigation";
import { DashboardPageShell } from "@/components/shared/dashboard-page-shell";
import { HubGrid, HubTile } from "@/components/shared/hub-grid";

/** Labeled horizontal rule — same recipe as Knowledge hub (MY DOCUMENTS). */
function HubSectionDivider({ label }: { label: string }) {
  return (
    <div className="my-4 flex items-center gap-3">
      <div className="h-px flex-1 bg-border" />
      <span className="text-xs font-medium uppercase text-muted-foreground">{label}</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

/**
 * Hub for messaging / leads automation pages — same button-grid pattern as
 * Forms and Views. Individual pages keep their own routes; this menu is only
 * the entry point from the sidebar (PAGES group).
 */
export default function MsgAutomationPage() {
  const router = useRouter();

  return (
    <DashboardPageShell title="Msg Automation">
      {/*
        Fixed 4-column grid (same as Forms / Views): buttons keep column
        width; leftover cells on the last row stay empty instead of stretching.
        Row 1: primary messaging surfaces. Below the separator: planning/status tools.
        Bottom (OBSOLETE): legacy Links + Manual Messages.
      */}
      <HubGrid>
        <HubTile label="MULTIVIEW" onClick={() => router.push("/dashboard/msg-automation/multiview")} />
        <HubTile label="GROUPS" onClick={() => router.push("/dashboard/msg-automation/groups")} />
        <HubTile label="BEEPER" onClick={() => router.push("/dashboard/beeper")} />
        <HubTile label="CREATOR" onClick={() => router.push("/dashboard/leads/message-creator")} />
        <HubTile label="LINKS V2" onClick={() => router.push("/dashboard/msg-automation/links-v2")} />
        <HubTile label="AI PROMPTS" onClick={() => router.push("/dashboard/msg-automation/ai-prompts")} />
        <HubTile
          label="GOOGLE CONTACTS"
          onClick={() => router.push("/dashboard/msg-automation/google-contacts")}
        />
      </HubGrid>

      <hr className="border-t my-3" />

      <HubGrid>
        <HubTile label="STATUSES" onClick={() => router.push("/dashboard/statuses")} />
        <HubTile label="MSG TODO" onClick={() => router.push("/dashboard/todo-msg")} />
        <HubTile label="MSG PLANNER" onClick={() => router.push("/dashboard/msg-planner")} />
        <HubTile label="MSG WORKOUT" onClick={() => router.push("/dashboard/msg-automation/msg-workout")} />
        <HubTile
          label="MANUALLY ADDED MSG"
          ariaLabel="MANUALLY ADDED MSG"
          title="MANUALLY ADDED MSG"
          className="leading-tight"
          onClick={() => router.push("/dashboard/msg-automation/msg-workout/manually-added-msg")}
        />
      </HubGrid>

      <HubSectionDivider label="Obsolete" />

      <HubGrid>
        <HubTile label="LINKS" onClick={() => router.push("/dashboard/msg-automation/links")} />
        <HubTile label="MANUAL MESSAGES" onClick={() => router.push("/dashboard/messages")} />
      </HubGrid>
    </DashboardPageShell>
  );
}
