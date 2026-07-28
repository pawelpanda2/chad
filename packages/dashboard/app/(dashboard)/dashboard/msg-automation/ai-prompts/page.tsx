"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardPageShell } from "@/components/shared/dashboard-page-shell";
import { FRAME_SECTION_GAP_CLASS } from "@/components/shared/layout-tokens";
import { Button } from "@/components/ui/button";
import { ErrorBox } from "@/components/shared/error-box";
import { cn } from "@/lib/utils";
import { Loader2, Plus } from "lucide-react";
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

/**
 * Left-packed columns (phone-friendly): Ver | Name | Category | empty spacer.
 * Content columns size to content; the last cell flex-grows so the row still
 * fills the card without stretching Category to the right.
 */
const ROW =
  "flex w-full items-stretch text-left";

const CELL =
  "flex shrink-0 items-center border-border px-2.5 py-2.5 first:pl-3 [&:not(:last-child)]:border-r";

const NAME_CELL =
  "flex min-w-0 max-w-[9.5rem] shrink flex-col items-start justify-center gap-0.5 border-border px-2.5 py-2.5 sm:max-w-[14rem] [&:not(:last-child)]:border-r";

const SPACER_CELL = "min-w-0 flex-1";

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
            <div className={cn(ROW, "text-xs font-semibold uppercase tracking-wide text-muted-foreground")}>
              <div className={cn(CELL, "w-12 justify-start")}>Ver.</div>
              <div className={cn(NAME_CELL, "font-semibold")}>Name</div>
              <div className={CELL}>Category</div>
              <div className={SPACER_CELL} aria-hidden />
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
                    ROW,
                    "rounded-xl border border-border bg-background transition-colors hover:bg-accent/60"
                  )}
                >
                  <div className={cn(CELL, "w-12 font-semibold text-muted-foreground")}>
                    v{p.version}
                  </div>
                  <div className={NAME_CELL}>
                    <span className="w-full truncate text-sm font-semibold">{p.name}</span>
                    <span className="w-full truncate text-xs text-muted-foreground">{p.slug}</span>
                  </div>
                  <div className={CELL}>
                    <span
                      className={cn(
                        "inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold",
                        kind === "openai_managed"
                          ? "bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200"
                          : "bg-violet-50 text-violet-800 dark:bg-violet-950/40 dark:text-violet-200"
                      )}
                    >
                      {category}
                    </span>
                  </div>
                  <div className={SPACER_CELL} aria-hidden />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </DashboardPageShell>
  );
}
