"use client";

import Link from "next/link";
import { Suspense, useState, useEffect, useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DashboardPageShell } from "@/components/shared/dashboard-page-shell";
import { buildLeadDetailsHref, getLeadDetailsHref } from "@/lib/lead-links";
import {
  RefreshCw,
  ArrowLeft,
  Table as TableIcon,
  Search,
  ArrowUp,
  ArrowDown,
  User,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";

// ============================================================================
// Types
// ============================================================================

interface DateEntryRecord {
  itemName: string;
  body?: Record<string, unknown>;
}

interface DailyEntryRecord {
  itemName: string;
  body?: Record<string, unknown>;
}

interface LeadDashboardItem {
  leadKey: string;
  leadName: string;
  loca: string;
  hasContacts: boolean;
}

type ViewType = null | "tracker" | "dates" | "leads";
type SortDir = "asc" | "desc";

// ============================================================================
// Column definitions — mirror the Google Sheets exactly: order, grouping,
// section colors. "— AUTO" columns are computed server-side in
// /api/views (see computeDailyAutoFieldsByDate in dba) from Date entries
// matched by day.
// ============================================================================

type Group = "none" | "training" | "action" | "texting" | "results";

const DATE_COLUMNS: Array<{ key: string; label: string; group: Group }> = [
  { key: "DATA", label: "DATA", group: "none" },
  { key: "ŹRÓDŁO", label: "ŹRÓDŁO", group: "none" },
  { key: "NAZWA", label: "NAZWA", group: "none" },
  { key: "LINK", label: "LINK", group: "none" },
  { key: "PULL", label: "PULL", group: "none" },
  { key: "CLOSE", label: "CLOSE", group: "none" },
  { key: "JAKOŚĆ", label: "JAKOŚĆ", group: "none" },
];

const DAILY_COLUMNS: Array<{ key: string; label: string; group: Group }> = [
  { key: "DATE", label: "DATE", group: "none" },
  { key: "STATE", label: "STATE", group: "training" },
  { key: "TRAINING TIME", label: "TRAINING TIME", group: "training" },
  { key: "VERBAL EXERCISES", label: "VERBAL EXERCISES", group: "training" },
  { key: "INFIELD", label: "INFIELD", group: "training" },
  { key: "THEORY", label: "THEORY", group: "training" },
  { key: "FIELD REVIEW", label: "FIELD REVIEW", group: "training" },
  { key: "ACTION TIME", label: "ACTION TIME", group: "action" },
  { key: "APPROACHES", label: "APPROACHES", group: "action" },
  { key: "LONG INTERACTIONS", label: "LONG INTERACTIONS", group: "action" },
  { key: "NUMBERS", label: "NUMBERS", group: "action" },
  { key: "PULLS AUTO", label: "PULLS — AUTO", group: "action" },
  { key: "FIRST MESSAGES", label: "FIRST MESSAGES", group: "texting" },
  { key: "RESPONSES", label: "RESPONSES", group: "texting" },
  { key: "DATES SET UP", label: "DATES SET UP", group: "texting" },
  { key: "DATES", label: "DATES", group: "texting" },
  { key: "CLOSES AUTO", label: "CLOSES — AUTO", group: "results" },
  { key: "QUALITY DP AUTO", label: "QUALITY D/P — AUTO", group: "results" },
  { key: "QUALITY C AUTO", label: "QUALITY C — AUTO", group: "results" },
  { key: "OUTINGS", label: "OUTINGS", group: "results" },
];

const GROUP_HEADER_CLASS: Record<Group, string> = {
  none: "bg-muted",
  training: "bg-green-100 dark:bg-green-950/50",
  action: "bg-amber-100 dark:bg-amber-950/50",
  texting: "bg-blue-100 dark:bg-blue-950/50",
  results: "bg-rose-100 dark:bg-rose-950/50",
};

const CELL_CLASS: Record<Group, string> = {
  none: "",
  training: "bg-green-50/60 dark:bg-green-950/20",
  action: "bg-amber-50/60 dark:bg-amber-950/20",
  texting: "bg-blue-50/60 dark:bg-blue-950/20",
  results: "bg-rose-50/60 dark:bg-rose-950/20",
};

// ============================================================================
// Main Component
// ============================================================================

export default function ViewsPage() {
  return (
    <Suspense fallback={null}>
      <ViewsPageContent />
    </Suspense>
  );
}

function ViewsPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // The URL is the single source of truth for which view is selected, so
  // browser back/forward works correctly across: selection menu -> a view
  // -> (e.g.) a form's post-save redirect back into a view. Each transition
  // uses router.push (a new history entry), never replace.
  const viewParam = searchParams.get("view");
  const selectedView: ViewType =
    viewParam === "tracker" || viewParam === "dates" || viewParam === "leads" ? viewParam : null;
  const returnTo = searchParams.toString() ? `${pathname}?${searchParams.toString()}` : pathname;

  const [dateEntries, setDateEntries] = useState<DateEntryRecord[]>([]);
  const [dailyEntries, setDailyEntries] = useState<DailyEntryRecord[]>([]);
  const [leads, setLeads] = useState<LeadDashboardItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [sortKey, setSortKey] = useState<string>("");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [viewsRes, leadsRes] = await Promise.all([
        fetch("/api/views"),
        fetch("/api/leads-dashboard"),
      ]);
      const viewsResult = await viewsRes.json();
      const leadsResult = await leadsRes.json();

      if (viewsResult.success) {
        setDateEntries(viewsResult.dateEntries || []);
        setDailyEntries(viewsResult.dailyEntries || []);
      } else {
        setError(viewsResult.error || "Failed to fetch data");
        toast.error(viewsResult.error || "Failed to fetch data");
      }

      if (Array.isArray(leadsResult)) {
        setLeads(leadsResult);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      setError(errorMsg);
      toast.error(`Error: ${errorMsg}`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Reset filter/sort defaults whenever the selected view changes (including
  // via browser back/forward, since selectedView is derived from the URL).
  useEffect(() => {
    setFilter("");
    setSortKey(selectedView === "dates" ? "DATA" : selectedView === "tracker" ? "DATE" : "");
    setSortDir(selectedView === "dates" ? "desc" : "asc");
  }, [selectedView]);

  const handleRefresh = () => {
    fetchData();
    toast.success("Data refreshed");
  };

  const handleBack = () => {
    router.push(pathname);
  };

  const handleViewSelect = (view: ViewType) => {
    router.push(`${pathname}?view=${view}`);
  };

  const toggleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  // Computed unconditionally (before any early return) — Rules of Hooks:
  // useMemo can't be called after a conditional return.
  const currentEntries = useMemo(() => {
    const rawEntries = selectedView === "dates" ? dateEntries : selectedView === "tracker" ? dailyEntries : [];
    let result = rawEntries;
    if (filter.trim()) {
      const f = filter.toLowerCase().trim();
      result = result.filter(
        (entry) =>
          entry.itemName.toLowerCase().includes(f) ||
          Object.values(entry.body || {}).some((v) => String(v ?? "").toLowerCase().includes(f))
      );
    }
    if (!sortKey) return result;
    return [...result].sort((a, b) => {
      const av = String(a.body?.[sortKey] ?? "");
      const bv = String(b.body?.[sortKey] ?? "");
      const cmp = av.localeCompare(bv, undefined, { numeric: true });
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [selectedView, dateEntries, dailyEntries, filter, sortKey, sortDir]);

  const filteredLeads = useMemo(() => {
    if (!filter.trim()) return leads;
    const f = filter.toLowerCase().trim();
    return leads.filter(
      (lead) => lead.leadName.toLowerCase().includes(f) || lead.leadKey.toLowerCase().includes(f)
    );
  }, [leads, filter]);

  // ============================================================================
  // Render: View Selection Menu
  // ============================================================================

  if (!selectedView) {
    return (
      <DashboardPageShell toolbar={<h2 className="text-lg font-bold">Views</h2>}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => handleViewSelect("tracker")}
            className="flex flex-col items-center justify-center p-3 border rounded-lg hover:bg-accent hover:border-primary/50 transition-colors text-center min-h-[60px]"
          >
            <span className="font-semibold text-sm">TRACKER</span>
            <span className="text-xs text-muted-foreground mt-0.5">Daily tracker</span>
          </button>
          <button
            type="button"
            onClick={() => handleViewSelect("dates")}
            className="flex flex-col items-center justify-center p-3 border rounded-lg hover:bg-accent hover:border-primary/50 transition-colors text-center min-h-[60px]"
          >
            <span className="font-semibold text-sm">DATES</span>
            <span className="text-xs text-muted-foreground mt-0.5">Date entries</span>
          </button>
          <button
            type="button"
            onClick={() => handleViewSelect("leads")}
            className="flex flex-col items-center justify-center p-3 border rounded-lg hover:bg-accent hover:border-primary/50 transition-colors text-center min-h-[60px]"
          >
            <span className="font-semibold text-sm">LEADS</span>
            <span className="text-xs text-muted-foreground mt-0.5">All leads</span>
          </button>
        </div>
      </DashboardPageShell>
    );
  }

  // ============================================================================
  // Render: Leads (moved here from the former standalone /dashboard/leads
  // page — same data/links, just embedded as a Views option)
  // ============================================================================

  if (selectedView === "leads") {
    return (
      <DashboardPageShell
        toolbar={
          <>
            <Button variant="outline" size="sm" onClick={handleBack} className="gap-1 h-7 px-2">
              <ArrowLeft className="h-3 w-3" />Back
            </Button>
            <div className="flex items-center gap-2">
              <User className="h-4 w-4" />
              <h2 className="text-lg font-bold">Views / LEADS</h2>
            </div>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter leads..."
                className="pl-7 h-7 text-xs w-[220px]"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isLoading}
              className="gap-2 h-7 text-xs ml-auto"
            >
              <RefreshCw className={`h-3 w-3 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <span className="text-xs text-muted-foreground">
              {filteredLeads.length} of {leads.length} leads
            </span>
          </>
        }
      >
        {error && (
          <div className="mb-2 p-2 rounded-lg bg-red-50 text-red-700 border border-red-200 text-xs">
            Error: {error}
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center gap-2 py-4 text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span>Loading leads...</span>
          </div>
        ) : filteredLeads.length === 0 ? (
          <div className="flex items-center gap-3 py-4 text-muted-foreground">
            <User className="h-8 w-8 opacity-20" />
            <span className="text-sm">No leads found</span>
          </div>
        ) : (
          <div className="divide-y">
              {filteredLeads.map((lead) => (
                  <div
                    key={lead.leadKey}
                    className="flex items-center rounded-lg px-[10px] py-[10px] transition-colors group hover:bg-accent"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <Link
                        href={getLeadDetailsHref(lead.leadName, lead.loca)}
                        className="flex flex-shrink-0 items-center gap-2 rounded-lg"
                        aria-label={`Open lead details for ${lead.leadName}`}
                      >
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
                          <User className="h-3.5 w-3.5" />
                        </span>
                        <span className="text-xs text-muted-foreground flex-shrink-0">
                          {lead.leadKey}.
                        </span>
                      </Link>
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="font-medium text-sm truncate select-text">{lead.leadName}</span>
                        <Link
                          href={buildLeadDetailsHref({
                            leadName: lead.leadName,
                            leadLoca: lead.loca,
                            returnTo,
                          })}
                          className="text-xs text-primary underline underline-offset-4"
                        >
                          info
                        </Link>
                        {lead.hasContacts ? (
                          <span className="flex items-center gap-1 text-xs text-green-600">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Contacts
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">No contacts</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
          </div>
        )}
      </DashboardPageShell>
    );
  }

  // ============================================================================
  // Render: Tracker / Dates
  // ============================================================================

  const columns = selectedView === "dates" ? DATE_COLUMNS : DAILY_COLUMNS;
  const viewTitle = selectedView === "dates" ? "DATES" : "TRACKER";
  const isTracker = selectedView === "tracker";

  return (
    <DashboardPageShell
      scroll={false}
      padded={false}
      toolbar={
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={handleBack}
            className="gap-1 h-7 px-2"
          >
            <ArrowLeft className="h-3 w-3" />Back
          </Button>
          <div className="flex items-center gap-2">
            <TableIcon className="h-4 w-4" />
            <h2 className="text-lg font-bold">Views / {viewTitle}</h2>
          </div>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter rows..."
              className="pl-7 h-7 text-xs w-[220px]"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isLoading}
            className="gap-2 h-7 text-xs ml-auto"
          >
            <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <span className="text-xs text-muted-foreground">
            {currentEntries.length} of {(selectedView === "dates" ? dateEntries : dailyEntries).length}
          </span>
        </>
      }
    >
      {/* Error display */}
      {error && (
        <div className="mb-1 shrink-0 p-2 rounded-lg bg-red-50 text-red-700 border border-red-200 text-xs">
          Error: {error}
        </div>
      )}

      {/* Table — fills remaining space, scrolls internally only */}
      <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full border-collapse text-xs">
              <thead className="sticky top-0 z-10">
                {isTracker && (
                  <tr>
                    <th
                      className="border p-1 bg-muted"
                      colSpan={columns.filter((c) => c.group === "none").length}
                    />
                    {(["training", "action", "texting", "results"] as const).map((g) => (
                      <th
                        key={g}
                        colSpan={columns.filter((c) => c.group === g).length}
                        className={`border p-1 text-center font-bold ${GROUP_HEADER_CLASS[g]}`}
                      >
                        {g.toUpperCase()}
                      </th>
                    ))}
                  </tr>
                )}
                <tr>
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      onClick={() => toggleSort(col.key)}
                      className={`border p-1.5 px-2 text-left font-semibold whitespace-nowrap cursor-pointer select-none hover:brightness-95 ${GROUP_HEADER_CLASS[col.group]}`}
                    >
                      <span className="inline-flex items-center gap-1">
                        {col.label}
                        {sortKey === col.key && (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {currentEntries.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length} className="border h-8 text-center text-muted-foreground">
                      No entries yet. Use Forms to add data.
                    </td>
                  </tr>
                ) : (
                  currentEntries.map((entry) => (
                    <tr key={entry.itemName} className="hover:bg-accent/50">
                      {columns.map((col) => {
                        const raw = entry.body?.[col.key];
                        const value = typeof raw === "number" ? (Number.isInteger(raw) ? String(raw) : raw.toFixed(1)) : String(raw ?? "");
                        return (
                          <td
                            key={col.key}
                            className={`border p-1.5 px-2 whitespace-nowrap max-w-[180px] truncate ${CELL_CLASS[col.group]}`}
                            title={value}
                          >
                            {value}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
      </div>
    </DashboardPageShell>
  );
}
