"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { DashboardPageShell } from "@/components/shared/dashboard-page-shell";

/** Legacy deep-link — Add uses the Daily Entry–style form with Prompt type combobox. */
export default function NewManagedPromptRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/dashboard/msg-automation/ai-prompts/new");
  }, [router]);
  return (
    <DashboardPageShell title="Add Prompt">
      <p className="text-sm text-muted-foreground">Redirecting…</p>
    </DashboardPageShell>
  );
}
