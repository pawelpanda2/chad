"use client";

import Link from "next/link";
import { Suspense, useState, useEffect, useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DashboardPageShell } from "@/components/shared/dashboard-page-shell";
import { FRAME_SECTION_GAP_CLASS } from "@/components/shared/layout-tokens";
import { buildLeadDetailsHref } from "@/lib/lead-links";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RefreshCw, AlertCircle, CheckCircle2, MessageSquare } from "lucide-react";

// ============================================================================
// Types
// ============================================================================

interface LeadResult {
  leadKey: string;
  leadName: string;
  loca?: string;
  valid: boolean;
}

type FilterType = "todo" | "first-msg";
type CityFilter = "warszawa" | "krakow";

const FILTER_LABELS: Record<FilterType, string> = {
  "todo": "Todo",
  "first-msg": "Your first msg",
};

const CITY_LABELS: Record<CityFilter, string> = {
  "warszawa": "Warszawa",
  "krakow": "Krakow",
};

// ============================================================================
// Main Component
// ============================================================================

export default function TodoMsgPage() {
  return (
    <Suspense fallback={null}>
      <TodoMsgPageContent />
    </Suspense>
  );
}

function TodoMsgPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const returnTo = searchParams.toString()
    ? `${pathname}?${searchParams.toString()}`
    : pathname;

  // State
  const [filterType, setFilterType] = useState<FilterType>("todo");
  const [cityFilter, setCityFilter] = useState<CityFilter>("warszawa");
  const [leads, setLeads] = useState<LeadResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /** Load leads based on current filter type */
  const loadLeads = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/todo-msg?type=${filterType}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to load: ${response.status}`);
      }
      const data = await response.json();
      setLeads(data);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to load leads";
      setError(errorMsg);
      console.error(`Error loading ${filterType} leads:`, err);
    } finally {
      setLoading(false);
    }
  }, [filterType]);

  // Load leads on mount and when filter changes
  useEffect(() => {
    loadLeads();
  }, [loadLeads]);

  const openMsgEditor = (loca?: string) => {
    if (!loca) return;
    router.push(`/dashboard/todo-msg/edit?loca=${encodeURIComponent(loca)}`);
  };

  // ========================================================================
  // Render
  // ========================================================================

  const toolbar = (
    <>
      <Select
        value={filterType}
        onValueChange={(value: FilterType) => setFilterType(value)}
      >
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder="Select filter" />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(FILTER_LABELS).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={cityFilter}
        onValueChange={(value: CityFilter) => setCityFilter(value)}
      >
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Select city" />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(CITY_LABELS).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <button
        onClick={loadLeads}
        disabled={loading}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        Refresh
      </button>
    </>
  );

  return (
    <DashboardPageShell title="Msg Todo" contentClassName={FRAME_SECTION_GAP_CLASS}>
      <div className="flex shrink-0 flex-wrap items-center gap-3">{toolbar}</div>
      <div className="rounded-lg border bg-muted/10 p-2">
      {loading ? (
        <div className="flex items-center gap-2 py-4 text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" />
          <span>Loading leads...</span>
        </div>
      ) : error ? (
        <div className="flex flex-col items-start gap-2 py-4 text-muted-foreground">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-6 w-6" />
            <span>{error}</span>
          </div>
          <button
            onClick={loadLeads}
            className="text-sm text-primary hover:underline"
          >
            Retry
          </button>
        </div>
      ) : leads.length === 0 ? (
        <div className="flex items-center gap-3 py-4 text-muted-foreground">
          <MessageSquare className="h-8 w-8 opacity-20" />
          <span className="text-sm">No leads found for this filter</span>
        </div>
      ) : (
        <div className="divide-y">
              {leads.map((lead) => (
                <div
                  key={lead.leadKey}
                  className="flex items-center rounded-lg px-[10px] py-[10px] transition-colors group hover:bg-accent"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <button
                      type="button"
                      onClick={() => openMsgEditor(lead.loca)}
                      disabled={!lead.loca}
                      className="flex flex-shrink-0 items-center gap-2 rounded-lg disabled:cursor-default"
                    >
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <MessageSquare className="h-3.5 w-3.5" />
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {lead.leadKey}.
                      </span>
                    </button>
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {lead.loca ? (
                        <Link
                          href={buildLeadDetailsHref({
                            leadName: lead.leadName,
                            leadLoca: lead.loca,
                            returnTo,
                          })}
                          className="truncate text-sm font-medium hover:text-primary hover:underline"
                        >
                          {lead.leadName}
                        </Link>
                      ) : (
                        <span className="truncate text-sm font-medium select-text">
                          {lead.leadName}
                        </span>
                      )}
                      {lead.loca && (
                        <>
                          <span className="text-muted-foreground flex-shrink-0">·</span>
                          <span className="text-xs text-muted-foreground truncate">{lead.loca}</span>
                        </>
                      )}
                      {lead.valid ? (
                        <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-green-500" />
                      ) : (
                        <AlertCircle className="h-4 w-4 flex-shrink-0 text-yellow-500" />
                      )}
                    </div>
                  </div>
                </div>
              ))}
        </div>
      )}
      </div>
    </DashboardPageShell>
  );
}
