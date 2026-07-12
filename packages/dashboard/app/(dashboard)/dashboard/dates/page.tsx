"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { EditorPageShell } from "@/components/shared/editor-page-shell";
import { RefreshCw, AlertCircle, Search, ArrowUp, ArrowDown } from "lucide-react";

// ============================================================================
// Column spec — mirrors the DATES Google Sheet exactly (order + labels).
// ============================================================================

const COLUMNS = ["DATA", "ŹRÓDŁO", "NAZWA", "LINK", "PULL", "CLOSE", "JAKOŚĆ"] as const;

interface DateRow {
  itemName: string;
  loca: string;
  fields: Record<string, unknown>;
}

type SortDir = "asc" | "desc";

function isTruthy(value: unknown): boolean {
  return value === true || value === "TRUE" || value === "true" || value === "TAK";
}

export default function DatesPage() {
  const [rows, setRows] = useState<DateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [sortKey, setSortKey] = useState<string>("DATA");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/forms/date-entry");
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || `Failed to load: ${response.status}`);
      }
      const data = await response.json();
      setRows(data.entries || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load date entries");
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
          {filteredSorted.length} of {rows.length} dates
        </span>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden rounded-lg border">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="flex items-center gap-2 text-muted-foreground">
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span>Loading dates...</span>
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
              <thead className="bg-muted sticky top-0 z-10">
                <tr>
                  {COLUMNS.map((col) => (
                    <th
                      key={col}
                      onClick={() => toggleSort(col)}
                      className="border p-1.5 text-left font-medium whitespace-nowrap cursor-pointer select-none hover:brightness-95"
                    >
                      <span className="inline-flex items-center gap-1">
                        {col}
                        {sortKey === col && (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredSorted.length === 0 ? (
                  <tr>
                    <td colSpan={COLUMNS.length} className="border p-6 text-center text-muted-foreground">
                      No dates found.
                    </td>
                  </tr>
                ) : (
                  filteredSorted.map((row) => (
                    <tr key={row.loca} className="hover:bg-accent/50">
                      {COLUMNS.map((col) =>
                        col === "PULL" ? (
                          <td key={col} className="border p-1.5 px-2 text-center">
                            <input
                              type="checkbox"
                              checked={isTruthy(row.fields[col])}
                              readOnly
                              className="h-4 w-4 rounded border-gray-400"
                            />
                          </td>
                        ) : col === "LINK" ? (
                          <td key={col} className="border p-1.5 px-2 whitespace-nowrap max-w-[220px] truncate" title={String(row.fields[col] ?? "")}>
                            {String(row.fields[col] ?? "")}
                          </td>
                        ) : (
                          <td key={col} className="border p-1.5 px-2 whitespace-nowrap">
                            {String(row.fields[col] ?? "")}
                          </td>
                        )
                      )}
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
