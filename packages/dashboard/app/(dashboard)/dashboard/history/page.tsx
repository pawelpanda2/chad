"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DashboardPageShell } from "@/components/shared/dashboard-page-shell";
import { ErrorBox } from "@/components/shared/error-box";
import {
  FRAME_SECTION_GAP_CLASS,
  LIST_ROW_CLASS,
  LIST_ROW_WRAPPER_CLASS,
} from "@/components/shared/layout-tokens";
import { cn } from "@/lib/utils";
import {
  RefreshCw,
  Search,
  History as HistoryIcon,
  Calendar,
  User,
  ArrowRight,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { toast } from "sonner";

interface HistoryItem {
  id: string;
  address: string | null;
  operationType: string;
  changedAt: string;
  actor: {
    username: string;
    repoGuid: string;
  } | null;
  beforeUnknown: boolean;
  changedConfigPaths: string[];
  bodyChanged: boolean;
}

interface HistoryResult {
  items: HistoryItem[];
  total: number;
  page: number;
  pageSize: number;
}

export default function HistoryPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [filter, setFilter] = useState("");
  const [operationTypeFilter, setOperationTypeFilter] = useState<
    "insert" | "update" | "delete" | ""
  >("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Fetch history items
  const fetchHistory = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString(),
      });

      if (operationTypeFilter) {
        params.append("operationType", operationTypeFilter);
      }

      const response = await fetch(
        `/api/content-provider/history?${params.toString()}`
      );

      if (!response.ok) {
        throw new Error(
          `Failed to fetch history: ${response.status} ${response.statusText}`
        );
      }

      const data = (await response.json()) as {
        success: boolean;
        data: HistoryResult;
        error?: string;
      };

      if (!data.success) {
        throw new Error(data.error || "Failed to fetch history");
      }

      setItems(data.data.items);
      setTotal(data.data.total);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      toast.error("Failed to fetch history");
      console.error("[history] fetch failed:", err);
    } finally {
      setIsLoading(false);
    }
  }, [page, pageSize, operationTypeFilter]);

  // Fetch on mount and when filters change
  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Filter items by address
  const filteredItems = useMemo(
    () =>
      items.filter(
        (item) =>
          !filter ||
          (item.address?.toLowerCase().includes(filter.toLowerCase()) ?? false)
      ),
    [items, filter]
  );

  const handleBack = () => {
    window.history.back();
  };

  const handleRefresh = () => {
    setPage(1);
    fetchHistory();
  };

  const handlePageChange = (newPage: number) => {
    setPage(Math.max(1, newPage));
  };

  const operationIcon = (type: string) => {
    switch (type) {
      case "insert":
        return <ArrowRight className="h-3.5 w-3.5 text-green-600" />;
      case "update":
        return <ArrowRight className="h-3.5 w-3.5 text-blue-600" />;
      case "delete":
        return <ArrowRight className="h-3.5 w-3.5 text-red-600" />;
      default:
        return <ArrowRight className="h-3.5 w-3.5" />;
    }
  };

  const operationLabel = (type: string) => {
    switch (type) {
      case "insert":
        return "Created";
      case "update":
        return "Updated";
      case "delete":
        return "Deleted";
      default:
        return type;
    }
  };

  return (
    <DashboardPageShell
      contentClassName={cn(FRAME_SECTION_GAP_CLASS, "overscroll-contain")}
      upLevel={{ onClick: handleBack }}
      title="Change History"
    >
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setPage(1);
            }}
            placeholder="Filter by address..."
            className="pl-7 h-7 text-xs w-[220px]"
          />
        </div>

        <select
          value={operationTypeFilter}
          onChange={(e) => {
            setOperationTypeFilter(
              e.target.value as "insert" | "update" | "delete" | ""
            );
            setPage(1);
          }}
          className="h-7 text-xs px-2 rounded border bg-background"
        >
          <option value="">All operations</option>
          <option value="insert">Created</option>
          <option value="update">Updated</option>
          <option value="delete">Deleted</option>
        </select>

        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isLoading}
          className="gap-2 h-7 text-xs"
        >
          <RefreshCw className={`h-3 w-3 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>

        <span className="text-xs text-muted-foreground ml-auto">
          {filteredItems.length} of {total} entries
        </span>
      </div>

      {/* Error display */}
      <ErrorBox message={error} className="mb-2 shrink-0" />

      {/* History list */}
      <div className={LIST_ROW_WRAPPER_CLASS}>
        {isLoading ? (
          <div className="flex items-center gap-2 py-4 text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span>Loading history...</span>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex items-center gap-3 py-4 text-muted-foreground">
            <HistoryIcon className="h-8 w-8 opacity-20" />
            <span className="text-sm">No changes recorded yet.</span>
          </div>
        ) : (
          <div className="divide-y border bg-muted/10">
            {filteredItems.map((item) => (
              <div key={item.id} className="border-b last:border-b-0">
                {/* Row header */}
                <button
                  onClick={() =>
                    setExpandedId(expandedId === item.id ? null : item.id)
                  }
                  className={`w-full text-left flex items-center gap-3 p-3 hover:bg-muted/20 transition-colors ${LIST_ROW_CLASS}`}
                >
                  {/* Operation icon */}
                  <div className="flex items-center justify-center flex-shrink-0">
                    {operationIcon(item.operationType)}
                  </div>

                  {/* Main content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">
                        {operationLabel(item.operationType)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {item.address || "(no address)"}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 mt-1">
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {new Date(item.changedAt).toLocaleString()}
                      </span>
                      {item.actor && (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <User className="h-3 w-3" />
                          {item.actor.username}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Expand chevron */}
                  <div className="flex-shrink-0">
                    {expandedId === item.id ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                </button>

                {/* Expanded details */}
                {expandedId === item.id && (
                  <div className="px-3 pb-3 bg-muted/5 border-t text-xs space-y-2">
                    {item.beforeUnknown && (
                      <div className="text-yellow-700 bg-yellow-50 p-2 rounded">
                        ⚠️ &quot;Before&quot; state unknown (first change after worker
                        startup)
                      </div>
                    )}

                    {item.changedConfigPaths.length > 0 && (
                      <div>
                        <div className="font-medium mb-1">Config changes:</div>
                        <div className="ml-3 space-y-1">
                          {item.changedConfigPaths.map((path, idx) => (
                            <div
                              key={idx}
                              className="text-muted-foreground font-mono"
                            >
                              {path}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {item.bodyChanged && (
                      <div className="text-blue-700 bg-blue-50 p-2 rounded">
                        ✓ Body content changed
                      </div>
                    )}

                    {item.changedConfigPaths.length === 0 &&
                      !item.bodyChanged && (
                        <div className="text-muted-foreground italic">
                          No details recorded
                        </div>
                      )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {!isLoading && total > pageSize && (
        <div className="flex items-center justify-between gap-4 text-sm">
          <span className="text-muted-foreground">
            Page {page} of {Math.ceil(total / pageSize)}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(page - 1)}
              disabled={page <= 1}
              className="h-7 text-xs"
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(page + 1)}
              disabled={page >= Math.ceil(total / pageSize)}
              className="h-7 text-xs"
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </DashboardPageShell>
  );
}
