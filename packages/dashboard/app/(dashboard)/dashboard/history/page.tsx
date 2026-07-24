"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DashboardPageShell } from "@/components/shared/dashboard-page-shell";
import { FRAME_SECTION_GAP_CLASS } from "@/components/shared/layout-tokens";
import { ErrorBox } from "@/components/shared/error-box";
import { cn } from "@/lib/utils";
import { RefreshCw, User, ExternalLink } from "lucide-react";
import { toast } from "sonner";

type HistoryView = "items" | "google-sheets" | "daily-tracker" | "dates" | null;

export interface HistoryItem {
  id: string;
  address: string;
  itemName: string;
  version: number;
  operationType: string;
  changedAt: string;
  actor: {
    username: string;
    repoGuid: string;
    kind: string;
  };
}

interface HistoryResult {
  items: HistoryItem[];
  total: number;
  page: number;
  pageSize: number;
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

/** Compact table date: `26-07-24 17:05:33` (local time). */
function formatHistoryDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${yy} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Single-letter op codes to keep the column as narrow as possible. */
function operationLetter(type: string): string {
  switch (type) {
    case "insert":
      return "C";
    case "delete":
      return "D";
    case "update":
    case "replace":
      return "U";
    default:
      return (type[0] ?? "?").toUpperCase();
  }
}

function operationBadgeClass(type: string): string {
  switch (type) {
    case "insert":
      return "text-green-700 dark:text-green-500";
    case "update":
    case "replace":
      return "text-blue-700 dark:text-blue-500";
    case "delete":
      return "text-red-600 dark:text-red-500";
    default:
      return "text-muted-foreground";
  }
}

/** Address without repoGuid — e.g. `guid/01/02` → `01/02`; repo root → empty. */
function locaPathFromAddress(address: string): string {
  const slash = address.indexOf("/");
  if (slash < 0) return "";
  return address.slice(slash + 1);
}

/**
 * Shared history table, parameterized by which API endpoint to list from —
 * `content-provider/history` (all `cp_items`, no address filter) for
 * "Items", `content-provider/daily-history` (Daily Tracker's resolved
 * address prefix only) for "Daily Tracker", etc. Both call the same `dba`
 * `cp-history.ts` functions server-side; only the address filter differs.
 *
 * Story 79 GUI rewrite: a plain table (visually matching Daily
 * Tracker/Statuses' own `<table>` markup — `border bg-muted/10` wrapper,
 * `border p-1 bg-muted` header cells), not an accordion — no
 * expand/collapse, no pagination controls. Every matching record for the
 * current filter is fetched (looping the paginated API transparently) and
 * shown in one scrollable table body; clicking a row navigates to a
 * separate details route instead of expanding in place.
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
  const [operationTypeFilter, setOperationTypeFilter] = useState<
    "insert" | "update" | "delete" | ""
  >("");

  const fetchAllHistory = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const pageSize = 200;
      let page = 1;
      let all: HistoryItem[] = [];
      // Loops the paginated API transparently — the UI itself never shows
      // page controls (Story 79 GUI rewrite: "Filtr działa bez paginacji").
      for (;;) {
        const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
        if (operationTypeFilter) params.append("operationType", operationTypeFilter);

        const response = await fetch(`${apiUrl}?${params.toString()}`);
        if (!response.ok) {
          throw new Error(`Failed to fetch history: ${response.status} ${response.statusText}`);
        }
        const data = (await response.json()) as { success: boolean; data: HistoryResult; error?: string };
        if (!data.success) throw new Error(data.error || "Failed to fetch history");

        all = all.concat(data.data.items);
        if (all.length >= data.data.total || data.data.items.length === 0) break;
        page++;
      }

      setItems(all);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      toast.error(`Failed to fetch ${title.toLowerCase()}`);
      console.error(`[${emptyLabel}] fetch failed:`, err);
    } finally {
      setIsLoading(false);
    }
  }, [apiUrl, operationTypeFilter, title, emptyLabel]);

  useEffect(() => {
    fetchAllHistory();
  }, [fetchAllHistory]);

  const handleBack = () => {
    router.push("/dashboard/history");
  };

  const handleRowClick = (id: string) => {
    router.push(`/dashboard/history/entry/${id}`);
  };

  return (
    <DashboardPageShell
      upLevel={{ onClick: handleBack }}
      title={title}
      contentClassName={cn(FRAME_SECTION_GAP_CLASS, "overscroll-contain overflow-x-auto")}
    >
      {/* Controls + table live inside the outer shell frame — same scroll
          pattern as Statuses / Daily Tracker (Story 62): one scrollbar on
          the rounded frame, not a nested max-h table box. */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          aria-label="Operation"
          value={operationTypeFilter}
          onChange={(e) => {
            setOperationTypeFilter(e.target.value as "insert" | "update" | "delete" | "");
          }}
          className="h-7 text-xs px-2 rounded border bg-background"
        >
          <option value="">All</option>
          <option value="insert">Created</option>
          <option value="update">Updated</option>
          <option value="delete">Deleted</option>
        </select>

        <Button
          variant="outline"
          size="sm"
          onClick={fetchAllHistory}
          disabled={isLoading}
          className="h-7"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
        </Button>

        <div className="ml-auto text-xs text-muted-foreground">{items.length} entries</div>
      </div>

      {error && <ErrorBox message={error} />}

      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && items.length === 0 && !error && (
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <span className="text-sm">No change history available</span>
        </div>
      )}

      {!isLoading && items.length > 0 && (
        <div className="border bg-muted/10">
          <table className="w-full border-collapse text-sm" data-testid="history-table">
            <thead className="bg-muted">
              <tr>
                <th className="border p-1 text-left font-medium text-muted-foreground whitespace-nowrap w-px">
                  Date
                </th>
                <th
                  className="border p-1 text-center font-medium text-muted-foreground whitespace-nowrap w-px"
                  title="C=Created, U=Updated, D=Deleted"
                >
                  Op
                </th>
                <th className="border p-1 text-left font-medium text-muted-foreground">loca</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const locaPath = locaPathFromAddress(item.address);
                return (
                  <tr
                    key={item.id}
                    data-testid="history-row"
                    onClick={() => handleRowClick(item.id)}
                    className="hover:bg-accent/50 cursor-pointer"
                  >
                    <td className="border p-1 whitespace-nowrap text-xs text-muted-foreground font-mono w-px">
                      {formatHistoryDate(item.changedAt)}
                    </td>
                    <td
                      className={cn(
                        "border p-1 whitespace-nowrap text-xs font-semibold text-center w-px",
                        operationBadgeClass(item.operationType)
                      )}
                      title={item.operationType}
                    >
                      {operationLetter(item.operationType)}
                    </td>
                    <td className="border p-1 text-xs leading-tight">
                      <div className="font-mono text-muted-foreground truncate">
                        {locaPath || "—"}
                      </div>
                      <div className="font-medium truncate">{item.itemName}</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </DashboardPageShell>
  );
}
