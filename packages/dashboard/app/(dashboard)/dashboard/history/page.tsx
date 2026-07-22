"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
  User,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";

type HistoryView = "items" | "google-sheets" | "daily-tracker" | "dates" | null;

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

interface HistoryConfigOp {
  op: "add" | "remove" | "replace";
  path: string;
  oldValue: unknown;
  newValue: unknown;
}

interface HistoryBodyHunk {
  added: boolean;
  removed: boolean;
  value: string;
}

interface HistoryDetail extends HistoryItem {
  changes: {
    config: HistoryConfigOp[];
    body: HistoryBodyHunk[] | null;
  };
}

function formatDiffValue(value: unknown): string {
  if (value === null || value === undefined) return "(none)";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

export default function HistoryPage() {
  const searchParams = useSearchParams();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  const viewParam = searchParams.get("view");
  const selectedView: HistoryView =
    viewParam === "daily-tracker"
      ? "daily-tracker"
      : viewParam === "dates"
        ? "dates"
        : viewParam === "google-sheets"
          ? "google-sheets"
          : viewParam === "items"
            ? "items"
            : null;

  if (!selectedView) {
    return <HistoryMenuPage />;
  }

  if (selectedView === "items") {
    return (
      <HistoryListContent
        apiUrl="/api/content-provider/history"
        title="All Items History"
        emptyLabel="items-history"
      />
    );
  }

  if (selectedView === "google-sheets") {
    return <GoogleSheetsViewContent />;
  }

  if (selectedView === "daily-tracker") {
    return (
      <HistoryListContent
        apiUrl="/api/content-provider/daily-history"
        title="Daily Tracker History"
        emptyLabel="daily-tracker-history"
      />
    );
  }

  if (selectedView === "dates") {
    return (
      <HistoryListContent
        apiUrl="/api/content-provider/dates-history"
        title="Dates History"
        emptyLabel="dates-history"
      />
    );
  }

  return null;
}

function HistoryMenuPage() {
  const router = useRouter();

  const handleSelectView = (view: HistoryView) => {
    router.push(`/dashboard/history?view=${view}`);
  };

  return (
    <DashboardPageShell title="History">
      {/*
        Same 4-column grid pattern as Views' own top-level menu — buttons
        keep their column width top-left instead of stretching/centering.
        Row 1: general/bookkeeping buttons (all items, Google Sheets link).
        Row 2 (below a light separator): mirrors Views' own button order
        (Daily Tracker, Dates) — one history view per Views tab.
      */}
      <div className="grid grid-cols-4 gap-2">
        <button
          type="button"
          onClick={() => handleSelectView("items")}
          className="flex flex-col items-center justify-center p-3 border rounded-lg hover:bg-accent hover:border-primary/50 transition-colors text-center min-h-[60px]"
        >
          <span className="font-semibold text-sm">ALL ITEMS</span>
        </button>
        <button
          type="button"
          onClick={() => handleSelectView("google-sheets")}
          className="flex flex-col items-center justify-center p-3 border rounded-lg hover:bg-accent hover:border-primary/50 transition-colors text-center min-h-[60px]"
        >
          <span className="font-semibold text-sm">GOOGLE SHEETS</span>
        </button>
      </div>

      <hr className="border-t my-3" />

      <div className="grid grid-cols-4 gap-2">
        <button
          type="button"
          onClick={() => handleSelectView("daily-tracker")}
          className="flex flex-col items-center justify-center p-3 border rounded-lg hover:bg-accent hover:border-primary/50 transition-colors text-center min-h-[60px]"
        >
          <span className="font-semibold text-sm">DAILY TRACKER</span>
        </button>
        <button
          type="button"
          onClick={() => handleSelectView("dates")}
          className="flex flex-col items-center justify-center p-3 border rounded-lg hover:bg-accent hover:border-primary/50 transition-colors text-center min-h-[60px]"
        >
          <span className="font-semibold text-sm">DATES</span>
        </button>
      </div>
    </DashboardPageShell>
  );
}

/**
 * History -> Google Sheets. Header card (User avatar) shows the current
 * user's own CHAD username and their spreadsheet link (never another
 * user's — resolved server-side from the session, see
 * /api/google-sheets/info) in the same rounded-card layout as
 * dashboard/leads/details. Below it: a card for the shared viewing
 * account's login (GOOGLE_SHEETS_VIEWER_ACCOUNT_EMAIL/PASSWORD env vars —
 * intentionally never set by default, see .env.local.example), and a card
 * for the service account it's shared with (safe to show — an email
 * address, not a credential).
 */
function GoogleSheetsViewContent() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<{
    infoConfigured: boolean;
    syncWritesEnabled: boolean;
    chadUsername?: string;
    spreadsheetId?: string | null;
    spreadsheetUrl?: string | null;
    spreadsheetError?: string | null;
    serviceAccountEmail?: string | null;
    viewerAccount?: { email: string; password: string } | null;
  } | null>(null);

  useEffect(() => {
    fetch("/api/google-sheets/info")
      .then((res) => res.json())
      .then((json: { success: boolean; data?: typeof data; error?: string }) => {
        if (!json.success || !json.data) throw new Error(json.error || "Failed to load Google Sheets info");
        setData(json.data);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Unknown error"))
      .finally(() => setIsLoading(false));
  }, []);

  const handleBack = () => router.push("/dashboard/history");

  return (
    <DashboardPageShell upLevel={{ onClick: handleBack }} title="Google Sheets" contentClassName="gap-1">
      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {error && <ErrorBox message={error} />}

      {!isLoading && data && !data.infoConfigured && (
        <div className="text-sm text-muted-foreground py-4">
          Google Sheets is not configured on this environment (no
          GOOGLE_SHEETS_SPREADSHEET_MAP set).
        </div>
      )}

      {!isLoading && data && data.infoConfigured && (
        <>
          {!data.syncWritesEnabled && (
            <div className="text-xs text-amber-700 bg-amber-50 dark:bg-amber-950/30 rounded-md px-3 py-2">
              Sync writes are disabled on this environment — this page shows
              your spreadsheet link/info only; saves here do not sync to
              Google.
            </div>
          )}
          {/* Header card: CHAD username + link to their spreadsheet, same layout as leads/details' Lead Header Card */}
          <Card className="gap-0 py-0">
            <CardContent className="px-[14px] py-[12px]">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <User className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <h1 className="text-base font-semibold leading-tight truncate">
                    {data.chadUsername || "Unknown user"}
                  </h1>
                  {data.spreadsheetUrl ? (
                    <a
                      href={data.spreadsheetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline mt-0.5"
                    >
                      {data.spreadsheetUrl}
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  ) : (
                    <div className="text-sm text-amber-700 mt-0.5">
                      {data.spreadsheetError || "No spreadsheet configured for your account."}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Google account card: viewer login (email + password) to open the sheet interactively */}
          <Card className="gap-0 py-0">
            <CardContent className="px-[14px] py-[10px]">
              <h2 className="text-sm font-semibold mb-2">Google account</h2>
              {data.viewerAccount ? (
                <div className="space-y-1 text-sm">
                  <div>
                    <span className="text-muted-foreground">Email:</span>{" "}
                    <span className="font-mono">{data.viewerAccount.email}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Password:</span>{" "}
                    <span className="font-mono">{data.viewerAccount.password}</span>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">
                  No test account configured (GOOGLE_SHEETS_VIEWER_ACCOUNT_EMAIL/PASSWORD unset).
                </div>
              )}
            </CardContent>
          </Card>

          {/* Service account card: edit-access identity the spreadsheet is shared with, no interactive login */}
          {data.serviceAccountEmail && (
            <Card className="gap-0 py-0">
              <CardContent className="px-[14px] py-[10px]">
                <h2 className="text-sm font-semibold mb-2">Service account</h2>
                <div className="text-sm font-mono">{data.serviceAccountEmail}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  Edit access, no interactive login.
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </DashboardPageShell>
  );
}

/**
 * Shared history list/detail view, parameterized by which API endpoint to
 * list from — `content-provider/history` (all `cp_items`, no address
 * filter) for "Items", `content-provider/daily-history` (Daily Tracker's
 * resolved address prefix only) for "Daily Tracker". Both call the same
 * `dba` `cp-history.ts` functions server-side; only the address filter
 * differs, so the list/detail UI itself is not duplicated per view.
 */
function HistoryListContent({
  apiUrl,
  title,
  emptyLabel,
}: {
  apiUrl: string;
  title: string;
  emptyLabel: string;
}) {
  const router = useRouter();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [operationTypeFilter, setOperationTypeFilter] = useState<
    "insert" | "update" | "delete" | ""
  >("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [details, setDetails] = useState<
    Record<string, HistoryDetail | "loading" | "error">
  >({});

  const toggleExpanded = useCallback(
    (id: string) => {
      if (expandedId === id) {
        setExpandedId(null);
        return;
      }
      setExpandedId(id);
      if (details[id]) return;
      setDetails((prev) => ({ ...prev, [id]: "loading" }));
      fetch(`/api/content-provider/history/${id}`)
        .then((res) => res.json())
        .then((data: { success: boolean; data: HistoryDetail }) => {
          if (!data.success) throw new Error("failed");
          setDetails((prev) => ({ ...prev, [id]: data.data }));
        })
        .catch(() => {
          setDetails((prev) => ({ ...prev, [id]: "error" }));
        });
    },
    [expandedId, details]
  );

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

      const response = await fetch(`${apiUrl}?${params.toString()}`);

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
      toast.error(`Failed to fetch ${title.toLowerCase()}`);
      console.error(`[${emptyLabel}] fetch failed:`, err);
    } finally {
      setIsLoading(false);
    }
  }, [apiUrl, page, pageSize, operationTypeFilter, title, emptyLabel]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleBack = () => {
    router.push("/dashboard/history");
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

  const totalPages = Math.ceil(total / pageSize);
  const startIndex = (page - 1) * pageSize;

  return (
    <DashboardPageShell
      contentClassName={cn(FRAME_SECTION_GAP_CLASS, "overscroll-contain")}
      upLevel={{ onClick: handleBack }}
      title={title}
    >
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
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
          className="h-7"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
        </Button>

        <div className="ml-auto text-xs text-muted-foreground">
          {total} entries • Page {page} of {totalPages}
        </div>
      </div>

      {/* Error */}
      {error && <ErrorBox message={error} />}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty State */}
      {!isLoading && items.length === 0 && !error && (
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <span className="text-sm">No change history available</span>
        </div>
      )}

      {/* List */}
      {!isLoading && items.length > 0 && (
        <>
          <div className={LIST_ROW_WRAPPER_CLASS}>
            {items.map((item, _idx) => {
              const isExpanded = expandedId === item.id;

              return (
                <div key={item.id} className={cn(LIST_ROW_CLASS, "flex-col gap-2")}>
                  {/* Header Row */}
                  <div
                    onClick={() => toggleExpanded(item.id)}
                    className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
                  >
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 -ml-2"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleExpanded(item.id);
                      }}
                    >
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </Button>

                    <div className="flex items-center gap-2">
                      {operationIcon(item.operationType)}
                      <span className="text-xs font-medium w-16">
                        {operationLabel(item.operationType)}
                      </span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {item.address || "(no address)"}
                      </div>
                      {item.actor && (
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {item.actor.username}
                        </div>
                      )}
                    </div>

                    <div className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(item.changedAt).toLocaleString()}
                    </div>

                    {item.beforeUnknown && (
                      <div className="text-xs bg-amber-100 text-amber-900 px-2 py-1 rounded">
                        first event
                      </div>
                    )}
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="text-xs text-muted-foreground pl-8 border-t pt-2 space-y-2">
                      {details[item.id] === "loading" && (
                        <div className="flex items-center gap-2">
                          <RefreshCw className="h-3 w-3 animate-spin" />
                          Loading details…
                        </div>
                      )}
                      {details[item.id] === "error" && (
                        <div className="text-red-600">Failed to load details.</div>
                      )}
                      {details[item.id] &&
                        details[item.id] !== "loading" &&
                        details[item.id] !== "error" &&
                        (() => {
                          const detail = details[item.id] as HistoryDetail;
                          const configOps = detail.changes.config;
                          const bodyHunks = detail.changes.body;
                          return (
                            <>
                              {configOps.length > 0 && (
                                <div>
                                  <div className="font-medium mb-1">Config changes:</div>
                                  <div className="space-y-1">
                                    {configOps.map((op, i) => (
                                      <div key={i} className="font-mono">
                                        <span className="text-foreground">{op.path}</span>
                                        {": "}
                                        <span className="text-red-600 line-through">
                                          {formatDiffValue(op.oldValue)}
                                        </span>
                                        {" → "}
                                        <span className="text-green-700">
                                          {formatDiffValue(op.newValue)}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {bodyHunks && bodyHunks.length > 0 && (
                                <div>
                                  <div className="font-medium mb-1">Body:</div>
                                  <div className="font-mono whitespace-pre-wrap rounded border bg-muted/20 p-2">
                                    {bodyHunks.map((hunk, i) => (
                                      <div
                                        key={i}
                                        className={cn(
                                          hunk.added && "text-green-700 bg-green-50",
                                          hunk.removed && "text-red-600 bg-red-50 line-through"
                                        )}
                                      >
                                        {hunk.added ? "+ " : hunk.removed ? "- " : "  "}
                                        {hunk.value}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {configOps.length === 0 && !bodyHunks?.length && (
                                <div className="italic">No changes recorded</div>
                              )}
                            </>
                          );
                        })()}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between gap-2 border-t pt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(page - 1)}
              disabled={page <= 1}
              className="h-7"
            >
              Previous
            </Button>
            <span className="text-xs text-muted-foreground">
              {startIndex + 1}–{Math.min(startIndex + pageSize, total)} of {total}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(page + 1)}
              disabled={page >= totalPages}
              className="h-7"
            >
              Next
            </Button>
          </div>
        </>
      )}
    </DashboardPageShell>
  );
}
