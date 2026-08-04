"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { AlertCircle, Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AiPromptLeadListItem {
  leadName: string;
  loca: string;
}

interface AiPromptLeadsTabProps {
  selectedLead: AiPromptLeadListItem | null;
  onSelectLead: (lead: AiPromptLeadListItem) => void;
}

/**
 * AI Prompts → editor workspace, "leads" tab: the caller's own leads
 * (`GET /api/leads-dashboard`, never chad_shared), newest-first as returned
 * by the API, with a client-side search filter. Selecting a lead is
 * reported to the parent (`AiPromptWorkspace`), which fetches auto
 * (report/conversation) context and unlocks the auto/base tabs.
 */
export function AiPromptLeadsTab({ selectedLead, onSelectLead }: AiPromptLeadsTabProps) {
  const [leads, setLeads] = useState<AiPromptLeadListItem[] | null>(null);
  const [leadsError, setLeadsError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/leads-dashboard");
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || `Failed to load leads (${res.status})`);
        if (cancelled) return;
        const items: AiPromptLeadListItem[] = Array.isArray(json)
          ? json.map((l: { leadName: string; loca: string }) => ({ leadName: l.leadName, loca: l.loca }))
          : [];
        setLeads(items);
      } catch (err) {
        if (!cancelled) setLeadsError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredLeads = (leads ?? []).filter((l) =>
    l.leadName.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search"
          className="h-9 pl-8 text-sm"
        />
      </div>

      {leadsError ? (
        <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {leadsError}
        </div>
      ) : leads === null ? (
        <div className="flex items-center gap-2 px-1 py-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading leads…
        </div>
      ) : filteredLeads.length === 0 ? (
        <div className="px-1 py-2 text-xs text-muted-foreground">
          {leads.length === 0 ? "No leads found." : "No leads match your search."}
        </div>
      ) : (
        <div className="space-y-1.5">
          {filteredLeads.map((lead) => {
            const isCurrent = selectedLead?.loca === lead.loca;
            return (
              <button
                key={lead.loca}
                type="button"
                onClick={() => onSelectLead(lead)}
                aria-current={isCurrent}
                className={cn(
                  "block w-full rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                  isCurrent
                    ? "border-primary bg-primary/10 font-semibold text-primary"
                    : "hover:bg-muted",
                )}
              >
                {lead.leadName}
                {isCurrent && (
                  <span className="ml-2 text-xs font-semibold text-green-600 dark:text-green-400">
                    currently selected
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
