"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardPageShell } from "@/components/shared/dashboard-page-shell";
import {
  FRAME_SECTION_GAP_CLASS,
  LIST_ROW_CLASS,
  LIST_ROW_WRAPPER_CLASS,
} from "@/components/shared/layout-tokens";
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
  description?: string;
  promptKind?: AiPromptKind | string;
  version: number;
}

/**
 * Fixed column widths for a ~560px list frame (Leads is 400px; prompts need
 * more room for Ver./Name/Category/Description).
 */
const ROW = "flex w-full items-center text-left";

const VER_CELL = "w-10 shrink-0";
const NAME_CELL = "w-[9.5rem] shrink-0";
const CATEGORY_CELL = "w-[8.5rem] shrink-0";
const DESCRIPTION_CELL = "min-w-0 flex-1";

const LIST_WIDTH_CLASS = "w-[560px] max-w-[560px]";

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
      scroll={false}
      contentClassName={FRAME_SECTION_GAP_CLASS}
    >
      <div className="flex shrink-0 flex-wrap items-center gap-3">
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

      {/* Column headers sit above the list frame (Leads-style frame below). */}
      <div className={cn("shrink-0 px-2", LIST_WIDTH_CLASS)}>
        <div
          className={cn(
            ROW,
            "px-[10px] text-xs font-semibold uppercase tracking-wide text-muted-foreground",
          )}
        >
          <div className={VER_CELL}>Ver.</div>
          <div className={NAME_CELL}>Name</div>
          <div className={CATEGORY_CELL}>Category</div>
          <div className={DESCRIPTION_CELL}>Description</div>
        </div>
      </div>

      <div
        className={cn(
          LIST_ROW_WRAPPER_CLASS,
          LIST_WIDTH_CLASS,
          "flex min-h-0 flex-1 flex-col overflow-y-auto",
        )}
      >
        {loading ? (
          <div className="flex items-center gap-2 py-4 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading prompts…</span>
          </div>
        ) : prompts.length === 0 ? (
          <div className="py-4 text-sm text-muted-foreground">No prompts yet</div>
        ) : (
          <div className="divide-y">
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
                  className={cn(ROW, "group w-full", LIST_ROW_CLASS)}
                >
                  <div className={cn(VER_CELL, "text-sm font-medium text-muted-foreground")}>
                    v{p.version}
                  </div>
                  <div className={cn(NAME_CELL, "min-w-0 pr-2")}>
                    <span className="block truncate text-sm font-medium">{p.name}</span>
                  </div>
                  <div className={cn(CATEGORY_CELL, "min-w-0 pr-2")}>
                    <span
                      className={cn(
                        "inline-flex max-w-full truncate rounded-full px-2 py-0.5 text-xs font-semibold",
                        kind === "openai_managed"
                          ? "bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200"
                          : "bg-violet-50 text-violet-800 dark:bg-violet-950/40 dark:text-violet-200",
                      )}
                    >
                      {category}
                    </span>
                  </div>
                  <div className={cn(DESCRIPTION_CELL, "min-w-0")}>
                    <span className="block truncate text-xs text-muted-foreground">
                      {p.description?.trim() || ""}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </DashboardPageShell>
  );
}
