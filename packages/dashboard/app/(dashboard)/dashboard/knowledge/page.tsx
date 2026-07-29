"use client";

import { useRouter } from "next/navigation";
import { DashboardPageShell } from "@/components/shared/dashboard-page-shell";

/**
 * Hub for the Knowledge sidebar item — same button-grid pattern as Forms,
 * Views and Msg Automation. Only one category exists today (Verbal game);
 * later stories are expected to add more knowledge categories as further
 * buttons here, without changing this shape.
 */
export default function KnowledgePage() {
  const router = useRouter();

  return (
    <DashboardPageShell title="Knowledge">
      <div className="grid grid-cols-4 gap-2">
        <button
          type="button"
          onClick={() => router.push("/dashboard/knowledge/verbal-game")}
          className="flex flex-col items-center justify-center p-3 border rounded-lg hover:bg-accent hover:border-primary/50 transition-colors text-center min-h-[60px]"
        >
          <span className="font-semibold text-sm">VERBAL GAME</span>
        </button>
      </div>
    </DashboardPageShell>
  );
}
