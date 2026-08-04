"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface AiPromptBaseTabProps {
  finalPrompt: string;
  loading: boolean;
  className?: string;
}

/**
 * AI Prompts → editor workspace, "base" tab: the exact, full final prompt
 * that Send will submit — never a JSON dump or a shortened summary. Built
 * exclusively by `dba`'s `buildLeadAnalysisCurrentCase` /
 * `appendAdditionalUserInput` via the `lead-context/preview` endpoint
 * (`AiPromptWorkspace`), so this text always matches the real request byte
 * for byte. Only rendered once a lead is selected (base/auto stay locked
 * until then) — the parent gates that, not this component.
 */
export function AiPromptBaseTab({ finalPrompt, loading, className }: AiPromptBaseTabProps) {
  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border">
        <div className="flex shrink-0 items-center justify-between border-b bg-muted/40 px-3 py-1.5 text-xs font-semibold">
          <span>final prompt</span>
          {loading && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              live preview
            </span>
          )}
        </div>
        <pre className="min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap break-words p-3 font-mono text-[11px] leading-relaxed">
          {finalPrompt || "…"}
        </pre>
      </div>
    </div>
  );
}
