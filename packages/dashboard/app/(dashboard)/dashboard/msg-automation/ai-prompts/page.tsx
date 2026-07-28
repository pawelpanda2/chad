"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardPageShell } from "@/components/shared/dashboard-page-shell";
import { FRAME_SECTION_GAP_CLASS } from "@/components/shared/layout-tokens";
import { Button } from "@/components/ui/button";
import { ErrorBox } from "@/components/shared/error-box";
import { cn } from "@/lib/utils";
import { ChevronRight, Loader2, Plus } from "lucide-react";
import {
  aiPromptKindLabel,
  normalizeAiPromptKind,
  type AiPromptKind,
} from "@/components/msg-automation/ai-prompt-kind";

interface AiPromptSummary {
  id: string;
  slug: string;
  name: string;
  promptKind?: AiPromptKind | string;
  version: number;
}

export default function AiPromptsListPage() {
  const router = useRouter();
  const [prompts, setPrompts] = useState<AiPromptSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/msg-automation/ai-prompts");
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || `Failed to load prompts (${res.status})`);
      }
      setPrompts(Array.isArray(json.data) ? json.data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openPrompt = (p: AiPromptSummary) => {
    router.push(`/dashboard/msg-automation/ai-prompts/${encodeURIComponent(p.id)}`);
  };

  return (
    <DashboardPageShell
      title="AI Prompts"
      upLevel={{ href: "/dashboard/msg-automation", label: "Msg Auto" }}
      contentClassName={FRAME_SECTION_GAP_CLASS}
    >
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-2 text-xs"
          onClick={() => router.push("/dashboard/msg-automation/ai-prompts/new")}
        >
          <Plus className="h-3 w-3" />
          Add
        </Button>
      </div>

      <ErrorBox message={error} className="shrink-0" />

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-muted/10 p-3">
        {loading ? (
          <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading prompts…
          </div>
        ) : prompts.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">No prompts yet</div>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-[minmax(0,1.7fr)_minmax(160px,0.9fr)_28px] gap-3 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <div>Name</div>
              <div>Category</div>
              <div />
            </div>
            {prompts.map((p) => {
              const kind = normalizeAiPromptKind(p.promptKind);
              const category = aiPromptKindLabel(kind);
              return (
                <button
                  type="button"
                  key={p.id}
                  data-testid="ai-prompt-row"
                  data-prompt-kind={kind}
                  onClick={() => openPrompt(p)}
                  className={cn(
                    "grid w-full grid-cols-[minmax(0,1.7fr)_minmax(160px,0.9fr)_28px] items-center gap-3 rounded-xl border border-border bg-background px-3 py-3 text-left transition-colors hover:bg-accent/60"
                  )}
                >
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-baseline gap-2">
                      <span className="shrink-0 text-xs font-semibold text-muted-foreground">
                        v{p.version}
                      </span>
                      <span className="truncate text-sm font-semibold">{p.name}</span>
                    </div>
                    <div className="truncate pl-0 text-xs text-muted-foreground sm:pl-7">
                      {p.slug}
                    </div>
                  </div>
                  <div>
                    <span
                      className={cn(
                        "inline-flex max-w-full truncate rounded-full px-2.5 py-1 text-xs font-semibold",
                        kind === "openai_managed"
                          ? "bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200"
                          : "bg-violet-50 text-violet-800 dark:bg-violet-950/40 dark:text-violet-200"
                      )}
                    >
                      {category}
                    </span>
                  </div>
                  <ChevronRight className="h-5 w-5 justify-self-end text-muted-foreground" />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </DashboardPageShell>
  );
}
