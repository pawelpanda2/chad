"use client";

import { useRouter } from "next/navigation";
import { DashboardPageShell } from "@/components/shared/dashboard-page-shell";

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
      */}
      <div className="grid grid-cols-4 gap-2">
        <button
          type="button"
          onClick={() => router.push("/dashboard/beeper")}
          className="flex flex-col items-center justify-center p-3 border rounded-lg hover:bg-accent hover:border-primary/50 transition-colors text-center min-h-[60px]"
        >
          <span className="font-semibold text-sm">BEEPER</span>
        </button>
        <button
          type="button"
          onClick={() => router.push("/dashboard/leads/message-creator")}
          className="flex flex-col items-center justify-center p-3 border rounded-lg hover:bg-accent hover:border-primary/50 transition-colors text-center min-h-[60px]"
        >
          <span className="font-semibold text-sm">CREATOR</span>
        </button>
        <button
          type="button"
          onClick={() => router.push("/dashboard/msg-automation/links")}
          className="flex flex-col items-center justify-center p-3 border rounded-lg hover:bg-accent hover:border-primary/50 transition-colors text-center min-h-[60px]"
        >
          <span className="font-semibold text-sm">LINKS</span>
        </button>
        <button
          type="button"
          onClick={() => router.push("/dashboard/msg-automation/ai-prompts")}
          className="flex flex-col items-center justify-center p-3 border rounded-lg hover:bg-accent hover:border-primary/50 transition-colors text-center min-h-[60px]"
        >
          <span className="font-semibold text-sm">AI PROMPTS</span>
        </button>
        <button
          type="button"
          onClick={() => router.push("/dashboard/messages")}
          className="flex flex-col items-center justify-center p-3 border rounded-lg hover:bg-accent hover:border-primary/50 transition-colors text-center min-h-[60px]"
        >
          <span className="font-semibold text-sm">MANUAL MESSAGES</span>
        </button>
      </div>

      <hr className="border-t my-3" />

      <div className="grid grid-cols-4 gap-2">
        <button
          type="button"
          onClick={() => router.push("/dashboard/statuses")}
          className="flex flex-col items-center justify-center p-3 border rounded-lg hover:bg-accent hover:border-primary/50 transition-colors text-center min-h-[60px]"
        >
          <span className="font-semibold text-sm">STATUSES</span>
        </button>
        <button
          type="button"
          onClick={() => router.push("/dashboard/todo-msg")}
          className="flex flex-col items-center justify-center p-3 border rounded-lg hover:bg-accent hover:border-primary/50 transition-colors text-center min-h-[60px]"
        >
          <span className="font-semibold text-sm">MSG TODO</span>
        </button>
        <button
          type="button"
          onClick={() => router.push("/dashboard/msg-planner")}
          className="flex flex-col items-center justify-center p-3 border rounded-lg hover:bg-accent hover:border-primary/50 transition-colors text-center min-h-[60px]"
        >
          <span className="font-semibold text-sm">MSG PLANNER</span>
        </button>
      </div>
    </DashboardPageShell>
  );
}
