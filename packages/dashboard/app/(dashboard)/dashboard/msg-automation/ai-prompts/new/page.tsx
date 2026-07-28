"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { DashboardPageShell } from "@/components/shared/dashboard-page-shell";
import { FRAME_SECTION_GAP_CLASS } from "@/components/shared/layout-tokens";
import { PromptForm } from "@/components/msg-automation/prompt-form";

function AddPromptFormInner() {
  const searchParams = useSearchParams();
  const promptId = searchParams.get("promptId");

  return (
    <DashboardPageShell
      title={promptId ? "Edit Prompt" : "Add Prompt"}
      upLevel={{ href: "/dashboard/msg-automation/ai-prompts", label: "AI Prompts" }}
      contentClassName={FRAME_SECTION_GAP_CLASS}
    >
      <PromptForm
        promptId={promptId}
        returnTo="/dashboard/msg-automation/ai-prompts"
        title={promptId ? "Edit Prompt" : "Add Prompt"}
      />
    </DashboardPageShell>
  );
}

export default function AddPromptPage() {
  return (
    <Suspense
      fallback={
        <DashboardPageShell title="Add Prompt" upLevel={{ href: "/dashboard/msg-automation/ai-prompts" }}>
          <p className="text-sm text-muted-foreground">Loading…</p>
        </DashboardPageShell>
      }
    >
      <AddPromptFormInner />
    </Suspense>
  );
}
