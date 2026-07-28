"use client";

import { useRouter } from "next/navigation";
import { DashboardPageShell } from "@/components/shared/dashboard-page-shell";
import { FRAME_SECTION_GAP_CLASS } from "@/components/shared/layout-tokens";
import { AI_PROMPT_KIND_OPTIONS } from "@/components/msg-automation/ai-prompt-kind";
import { cn } from "@/lib/utils";

export default function AiPromptTypePickerPage() {
  const router = useRouter();

  return (
    <DashboardPageShell
      title="AI Prompts"
      upLevel={{ href: "/dashboard/msg-automation/ai-prompts", label: "AI Prompts" }}
      contentClassName={FRAME_SECTION_GAP_CLASS}
    >
      <div className="rounded-lg border bg-muted/10 p-4">
        <h2 className="mb-4 text-base font-semibold">Add prompt</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {AI_PROMPT_KIND_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              data-testid={`ai-prompt-type-${opt.value}`}
              onClick={() =>
                router.push(
                  `/dashboard/msg-automation/ai-prompts/new/${
                    opt.value === "openai_managed" ? "managed" : "custom"
                  }`
                )
              }
              className={cn(
                "rounded-2xl border border-border bg-background p-5 text-left transition-colors hover:bg-accent/50"
              )}
            >
              <div className="text-base font-semibold">{opt.label}</div>
              <p className="mt-1 text-sm text-muted-foreground">{opt.description}</p>
            </button>
          ))}
        </div>
      </div>
    </DashboardPageShell>
  );
}
