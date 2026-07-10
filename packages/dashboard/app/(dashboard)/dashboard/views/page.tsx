"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw, ArrowLeft, Table as TableIcon } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

// ============================================================================
// Column definitions
// ============================================================================

const DATE_COLUMNS = [
  { key: "item", label: "item" },
  { key: "DATA", label: "DATA" },
  { key: "ŹRÓDŁO", label: "ŹRÓDŁO" },
  { key: "NAZWA", label: "NAZWA" },
  { key: "LINK", label: "LINK" },
  { key: "PULL", label: "PULL" },
  { key: "CLOSE", label: "CLOSE" },
  { key: "JAKOŚĆ", label: "JAKOŚĆ" },
];

const DAILY_COLUMNS = [
  { key: "item", label: "item" },
  { key: "DATE", label: "DATE" },
  { key: "STATE", label: "STATE" },
  { key: "TRAINING TIME", label: "TRAINING TIME" },
  { key: "VERBAL EXERCISES", label: "VERBAL EXERCISES" },
  { key: "INFIELD", label: "INFIELD" },
  { key: "THEORY", label: "THEORY" },
  { key: "FIELD REVIEW", label: "FIELD REVIEW" },
  { key: "ACTION TIME", label: "ACTION TIME" },
  { key: "APPROACHES", label: "APPROACHES" },
  { key: "LONG INTERACTIONS", label: "LONG INTERACTIONS" },
  { key: "NUMBERS", label: "NUMBERS" },
  { key: "FIRST MESSAGES", label: "FIRST MESSAGES" },
  { key: "RESPONSES", label: "RESPONSES" },
  { key: "DATES SET UP", label: "DATES SET UP" },
  { key: "DATES", label: "DATES" },
];

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
    // Update URL with view param
    window.history.replaceState({}, "", `/dashboard/views?view=${view}`);
  };

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

  const currentEntries = selectedView === "dates" ? dateEntries : dailyEntries;
  const columns = selectedView === "dates" ? DATE_COLUMNS : DAILY_COLUMNS;
  const viewTitle = selectedView === "dates" ? "DATES" : "TRACKER";

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
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
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isLoading}
          className="gap-2 h-7 text-xs"
        >
          <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
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
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              {columns.map((col) => (
                <TableHead
                  key={col.key}
                  className="h-8 px-2 text-xs font-semibold whitespace-nowrap"
                >
                  {col.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {currentEntries.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-8 text-center text-xs text-muted-foreground"
                >
                  No entries yet. Use Forms to add data.
                </TableCell>
              </TableRow>
            ) : (
              currentEntries.map((entry) => (
                <TableRow key={entry.itemName} className="hover:bg-muted/30">
                  {columns.map((col) => {
                    const value =
                      col.key === "item"
                        ? entry.itemName
                        : (entry.body?.[col.key as string] as string) || "";
                    return (
                      <TableCell
                        key={col.key}
                        className="p-1.5 px-2 text-xs whitespace-nowrap max-w-[150px] truncate"
                      >
                        {value}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
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