"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DashboardPageShell } from "@/components/shared/dashboard-page-shell";

/**
 * Msg Auto → Msg Workout hub — REVIEW (existing Beeper review) +
 * MANUALLY ADDED MESSAGES (Story 108). Same button-grid pattern as
 * Msg Automation / Forms.
 *
 * Deep links with `?contact=` / `?group=` (pre-hub URLs) redirect to Review.
 */
function MsgWorkoutHubInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.has("contact") || searchParams.has("group")) {
      router.replace(
        `/dashboard/msg-automation/msg-workout/review?${searchParams.toString()}`,
      );
    }
  }, [router, searchParams]);

  return (
    <DashboardPageShell title="Msg Workout" upLevel={{ href: "/dashboard/msg-automation" }}>
      <div className="grid grid-cols-4 gap-2">
        <button
          type="button"
          onClick={() => router.push("/dashboard/msg-automation/msg-workout/review")}
          className="flex flex-col items-center justify-center p-3 border rounded-lg hover:bg-accent hover:border-primary/50 transition-colors text-center min-h-[60px]"
        >
          <span className="font-semibold text-sm">REVIEW</span>
        </button>
        <button
          type="button"
          onClick={() =>
            router.push("/dashboard/msg-automation/msg-workout/manually-added-messages")
          }
          className="flex flex-col items-center justify-center p-3 border rounded-lg hover:bg-accent hover:border-primary/50 transition-colors text-center min-h-[60px]"
        >
          <span className="font-semibold text-sm">MANUALLY ADDED MESSAGES</span>
        </button>
      </div>
    </DashboardPageShell>
  );
}

export default function MsgWorkoutHubPage() {
  return (
    <Suspense fallback={null}>
      <MsgWorkoutHubInner />
    </Suspense>
  );
}
