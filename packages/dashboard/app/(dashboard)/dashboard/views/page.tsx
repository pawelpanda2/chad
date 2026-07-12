"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RefreshCw, ArrowLeft, Table as TableIcon, Search, ArrowUp, ArrowDown } from "lucide-react";
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

type ViewType = null | "dates" | "tracker";
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
  const [selectedView, setSelectedView] = useState<ViewType>(null);
  const [dateEntries, setDateEntries] = useState<DateEntryRecord[]>([]);
  const [dailyEntries, setDailyEntries] = useState<DailyEntryRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveInfo, setSaveInfo] = useState<{ path: string; item: string } | null>(null);
  const [filter, setFilter] = useState("");
  const [sortKey, setSortKey] = useState<string>("");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/views");
      const result = await response.json();
      
      if (result.success) {
        setDateEntries(result.dateEntries || []);
        setDailyEntries(result.dailyEntries || []);
        // Check for save info in response
        if (result.saveInfo) {
          setSaveInfo(result.saveInfo);
        }
      } else {
        setError(result.error || "Failed to fetch data");
        toast.error(result.error || "Failed to fetch data");
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

  // Check if we should show a specific view based on URL param or save info
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const view = params.get("view");
    if (view === "dates" || view === "tracker") {
      setSelectedView(view as ViewType);
    }
    
    // Clear save info after showing
    if (saveInfo) {
      const timer = setTimeout(() => setSaveInfo(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [saveInfo]);

  const handleRefresh = () => {
    fetchData();
    toast.success("Data refreshed");
  };

  const handleBack = () => {
    setSelectedView(null);
    setSaveInfo(null);
    // Clear URL params
    window.history.replaceState({}, "", "/dashboard/views");
  };

  const handleViewSelect = (view: ViewType) => {
    setSelectedView(view);
    setFilter("");
    setSortKey(view === "dates" ? "DATA" : "DATE");
    setSortDir(view === "dates" ? "desc" : "asc");
    // Update URL with view param
    window.history.replaceState({}, "", `/dashboard/views?view=${view}`);
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

  // ============================================================================
  // Render: View Selection Menu
  // ============================================================================

  if (!selectedView) {
    return (
      <div className="space-y-3">
        {/* Header */}
        <div>
          <h2 className="text-xl font-bold tracking-tight">Views</h2>
          <p className="text-sm text-muted-foreground">Select a view to display</p>
        </div>

        {/* View Selection Grid */}
        <div className="grid grid-cols-3 gap-2">
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
            onClick={() => handleViewSelect("tracker")}
            className="flex flex-col items-center justify-center p-3 border rounded-lg hover:bg-accent hover:border-primary/50 transition-colors text-center min-h-[60px]"
          >
            <span className="font-semibold text-sm">TRACKER</span>
            <span className="text-xs text-muted-foreground mt-0.5">Daily tracker</span>
          </button>
          {/* Placeholder for future views */}
          <div className="flex flex-col items-center justify-center p-3 border rounded-lg bg-muted/30 text-center min-h-[60px]">
            <span className="font-semibold text-sm text-muted-foreground">Coming soon</span>
            <span className="text-xs text-muted-foreground mt-0.5">More views</span>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // Render: Single View
  // ============================================================================

  const columns = selectedView === "dates" ? DATE_COLUMNS : DAILY_COLUMNS;
  const viewTitle = selectedView === "dates" ? "DATES" : "TRACKER";
  const isTracker = selectedView === "tracker";

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
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
      </div>

      {/* Save info display */}
      {saveInfo && (
        <div className="p-2 rounded-lg bg-green-50 text-green-700 border border-green-200 text-xs">
          <div className="font-semibold">Saved:</div>
          <div>path: {saveInfo.path}</div>
          <div>item: {saveInfo.item}</div>
        </div>
      )}

      {/* Table */}
      <div className="border rounded-lg overflow-hidden max-h-[calc(100dvh-14rem)] overflow-auto">
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

      {/* Error display */}
      {error && (
        <div className="p-2 rounded-lg bg-red-50 text-red-700 border border-red-200 text-xs">
          Error: {error}
        </div>
      )}
    </div>
  );
}