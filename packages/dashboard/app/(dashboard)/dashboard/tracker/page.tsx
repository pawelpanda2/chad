"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { EditorPageShell } from "@/components/shared/editor-page-shell";
import { RefreshCw, AlertCircle, Search, ArrowUp, ArrowDown } from "lucide-react";

// ============================================================================
// Column spec — mirrors the TRACKER Google Sheet exactly: column order,
// section grouping, and section colors. Names are NOT renamed (spec
// requirement). "— AUTO" columns (PULLS, CLOSES, QUALITY D/P, QUALITY C)
// are computed server-side (GET /api/forms/daily-entry) from Date Entry
// records matched by date — see computeDailyAutoFieldsByDate in dba for
// the exact rule and documentation/dashboard/common/features/
// daily-tracker-dates.md for how it was reconstructed.
// ============================================================================

interface Column {
  key: string;
  label: string;
  group: "none" | "training" | "action" | "texting" | "results";
  auto?: boolean;
}

const COLUMNS: Column[] = [
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
  { key: "PULLS AUTO", label: "PULLS — AUTO", group: "action", auto: true },
  { key: "FIRST MESSAGES", label: "FIRST MESSAGES", group: "texting" },
  { key: "RESPONSES", label: "RESPONSES", group: "texting" },
  { key: "DATES SET UP", label: "DATES SET UP", group: "texting" },
  { key: "DATES", label: "DATES", group: "texting" },
  { key: "CLOSES AUTO", label: "CLOSES — AUTO", group: "results", auto: true },
  { key: "QUALITY DP AUTO", label: "QUALITY D/P — AUTO", group: "results", auto: true },
  { key: "QUALITY C AUTO", label: "QUALITY C — AUTO", group: "results", auto: true },
  { key: "OUTINGS", label: "OUTINGS", group: "results" },
];

const GROUP_HEADER_CLASS: Record<Column["group"], string> = {
  none: "bg-muted",
  training: "bg-green-100 dark:bg-green-950/50",
  action: "bg-amber-100 dark:bg-amber-950/50",
  texting: "bg-blue-100 dark:bg-blue-950/50",
  results: "bg-rose-100 dark:bg-rose-950/50",
};

const CELL_CLASS: Record<Column["group"], string> = {
  none: "",
  training: "bg-green-50/60 dark:bg-green-950/20",
  action: "bg-amber-50/60 dark:bg-amber-950/20",
  texting: "bg-blue-50/60 dark:bg-blue-950/20",
  results: "bg-rose-50/60 dark:bg-rose-950/20",
};

const GROUP_LABELS: Record<Exclude<Column["group"], "none">, string> = {
  training: "TRAINING",
  action: "ACTION",
  texting: "TEXTING",
  results: "RESULTS",
};

interface TrackerRow {
  itemName: string;
  loca: string;
  fields: Record<string, unknown>;
}

type SortDir = "asc" | "desc";

export default function TrackerPage() {
  const [rows, setRows] = useState<TrackerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [sortKey, setSortKey] = useState<string>("DATE");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/forms/daily-entry");
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || `Failed to load: ${response.status}`);
      }
      const data = await response.json();
      setRows(data.entries || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load daily entries");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const filteredSorted = useMemo(() => {
    let result = rows;
    if (filter.trim()) {
      const f = filter.toLowerCase().trim();
      result = result.filter((row) =>
        Object.values(row.fields).some((v) => String(v ?? "").toLowerCase().includes(f)) ||
        row.itemName.toLowerCase().includes(f)
      );
    }
    return [...result].sort((a, b) => {
      const av = String(a.fields[sortKey] ?? "");
      const bv = String(b.fields[sortKey] ?? "");
      const cmp = av.localeCompare(bv, undefined, { numeric: true });
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [rows, filter, sortKey, sortDir]);

  return (
    <EditorPageShell>
      <div className="flex flex-wrap items-center gap-[10px]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter rows..."
            className="pl-9 w-[280px]"
          />
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
        <span className="text-sm text-muted-foreground ml-auto">
          {filteredSorted.length} of {rows.length} entries
        </span>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden rounded-lg border">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="flex items-center gap-2 text-muted-foreground">
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span>Loading tracker...</span>
            </div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-12">
            <div className="flex flex-col items-center gap-2 text-muted-foreground text-center px-4">
              <AlertCircle className="h-6 w-6" />
              <span>{error}</span>
            </div>
          </div>
        ) : (
          <div className="h-full overflow-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className="border p-1 bg-muted" />
                  {(["training", "action", "texting", "results"] as const).map((g) => (
                    <th
                      key={g}
                      colSpan={COLUMNS.filter((c) => c.group === g).length}
                      className={`border p-1 text-center text-xs font-bold ${GROUP_HEADER_CLASS[g]}`}
                    >
                      {GROUP_LABELS[g]}
                    </th>
                  ))}
                </tr>
                <tr>
                  {COLUMNS.map((col) => (
                    <th
                      key={col.key}
                      onClick={() => toggleSort(col.key)}
                      className={`border p-1.5 text-left font-medium whitespace-nowrap cursor-pointer select-none hover:brightness-95 ${GROUP_HEADER_CLASS[col.group]}`}
                      title={col.auto ? "Computed from matching Date Entry records for that day" : undefined}
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
                {filteredSorted.length === 0 ? (
                  <tr>
                    <td colSpan={COLUMNS.length} className="border p-6 text-center text-muted-foreground">
                      No entries found.
                    </td>
                  </tr>
                ) : (
                  filteredSorted.map((row) => (
                    <tr key={row.loca} className="hover:bg-accent/50">
                      {COLUMNS.map((col) => {
                        const value = row.fields[col.key];
                        const display =
                          typeof value === "number" ? (Number.isInteger(value) ? value : value.toFixed(1)) : String(value ?? "");
                        return (
                          <td key={col.key} className={`border p-1.5 px-2 whitespace-nowrap ${CELL_CLASS[col.group]}`}>
                            {display}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </EditorPageShell>
  );
}
