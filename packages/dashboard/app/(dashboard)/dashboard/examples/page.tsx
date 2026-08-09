"use client";

import { useRouter } from "next/navigation";
import { DashboardPageShell } from "@/components/shared/dashboard-page-shell";

/**
 * Hub for GUI-only demo/reference pages — same button-grid pattern as Msg
 * Automation / Knowledge (Story 114). Purely a demonstration layer: no
 * backend, no DBA, no `chad_shared` reads. Each tile freezes a past
 * accepted look (e.g. "Knowledge v1") on local mock data so it survives
 * later redesigns of the real, dynamic page as a side-by-side reference.
 */
export default function ExamplesPage() {
  const router = useRouter();

  return (
    <DashboardPageShell title="Examples">
      <div className="grid grid-cols-4 gap-2">
        <button
          type="button"
          onClick={() => router.push("/dashboard/examples/knowledge-v1")}
          className="flex flex-col items-center justify-center p-3 border rounded-lg hover:bg-accent hover:border-primary/50 transition-colors text-center min-h-[60px]"
        >
          <span className="font-semibold text-sm">KNOWLEDGE V1</span>
        </button>
      </div>
    </DashboardPageShell>
  );
}
