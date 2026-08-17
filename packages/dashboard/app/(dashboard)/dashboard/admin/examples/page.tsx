"use client";

import { useRouter } from "next/navigation";
import { DashboardPageShell } from "@/components/shared/dashboard-page-shell";

/**
 * Admin → Examples hub — GUI-only demo/reference pages (Story 114).
 * Same button-grid pattern as the main Admin hub.
 */
export default function AdminExamplesPage() {
  const router = useRouter();

  return (
    <DashboardPageShell title="Examples" upLevel={{ href: "/dashboard/admin", label: "Admin" }}>
      <div className="grid grid-cols-4 gap-2">
        <button
          type="button"
          onClick={() => router.push("/dashboard/admin/examples/knowledge-v1")}
          className="flex flex-col items-center justify-center p-3 border rounded-lg hover:bg-accent hover:border-primary/50 transition-colors text-center min-h-[60px]"
        >
          <span className="font-semibold text-sm">KNOWLEDGE V1</span>
        </button>
      </div>
    </DashboardPageShell>
  );
}
