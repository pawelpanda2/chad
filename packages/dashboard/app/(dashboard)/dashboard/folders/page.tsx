"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardPageShell } from "@/components/shared/dashboard-page-shell";
import { ErrorBox } from "@/components/shared/error-box";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, ArrowRight, RefreshCw } from "lucide-react";

/**
 * Content Provider browser, ported from
 * packages/net-content-provider/front_blazor/BlazorApp/Pages/Repos.razor
 * (+ TextView.razor/FolderView.razor) — see documentation/stories/57.
 *
 * Scoped to the current authenticated user's own repoGuid ONLY. Blazor's
 * Repos.razor has a repo combobox over ALL repos because it's a
 * single-operator desktop tool; this dashboard has an established
 * per-user Content Provider data isolation model
 * (documentation/dashboard/common/features/chad-user-data-isolation.md),
 * so "repo" here is a read-only label, not a switchable picker.
 *
 * Per-item toolbar buttons from the Blazor source (Folder/Content/Config/
 * Terminal — all talk to cp-plugin, a local desktop helper with no
 * meaning in a web dashboard; GoogleDoc/Tts; "Add" child-creation forms —
 * a write operation, not wired into cp-api yet) are deliberately omitted,
 * per the Story 57 request ("buttons below are unnecessary here").
 */

interface CpConfig {
  id: string;
  type: string;
  name: string;
  address: string;
  [key: string]: unknown;
}

interface CpItem {
  Body: string;
  Config: CpConfig;
  Settings: CpConfig;
  Address: string;
}

interface FolderApiResponse {
  item?: CpItem;
  repoGuid?: string;
  username?: string;
  error?: string;
}

function relativeLoca(address: string, repoGuid: string): string {
  if (address === repoGuid) return "";
  const prefix = `${repoGuid}/`;
  return address.startsWith(prefix) ? address.slice(prefix.length) : "";
}

function parseChildNameMap(body: string): Array<{ index: string; name: string }> {
  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed && typeof parsed === "object") {
      return Object.entries(parsed as Record<string, string>)
        .map(([index, name]) => ({ index, name }))
        .sort((a, b) => Number(a.index) - Number(b.index));
    }
  } catch {
    // Falls through to [] — an unparseable Body shows no children rather than crashing the page.
  }
  return [];
}

export default function FoldersPage() {
  const [repoGuid, setRepoGuid] = useState<string | null>(null);
  const [repoName, setRepoName] = useState<string>("");
  const [nav, setNav] = useState<{ items: CpItem[]; index: number }>({ items: [], index: -1 });
  const [locaInput, setLocaInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const currentItem = nav.index >= 0 ? nav.items[nav.index] : null;

  const fetchItem = useCallback(async (loca: string): Promise<{ item: CpItem; repoGuid: string } | null> => {
    setError(null);
    try {
      const res = await fetch(`/api/folders?loca=${encodeURIComponent(loca)}`);
      const data: FolderApiResponse = await res.json();
      if (!res.ok || !data.item || !data.repoGuid) {
        setError(data.error ?? `Request failed (${res.status})`);
        return null;
      }
      return { item: data.item, repoGuid: data.repoGuid };
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reach Content Provider");
      return null;
    }
  }, []);

  const pushItem = useCallback((item: CpItem) => {
    setNav((prev) => {
      const truncated = prev.items.slice(0, prev.index + 1);
      return { items: [...truncated, item], index: truncated.length };
    });
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const result = await fetchItem("");
      if (result) {
        setRepoGuid(result.repoGuid);
        setRepoName(result.item.Config.name);
        pushItem(result.item);
      }
      setLoading(false);
    })();
    // Load the repo root once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (currentItem && repoGuid) {
      setLocaInput(relativeLoca(currentItem.Address, repoGuid));
    }
  }, [currentItem, repoGuid]);

  async function handleGo() {
    setLoading(true);
    const result = await fetchItem(locaInput);
    if (result) pushItem(result.item);
    setLoading(false);
  }

  async function handleChildClick(childIndex: string) {
    const parentLoca = currentItem && repoGuid ? relativeLoca(currentItem.Address, repoGuid) : "";
    const childLoca = parentLoca ? `${parentLoca}/${childIndex}` : childIndex;
    setLoading(true);
    const result = await fetchItem(childLoca);
    if (result) pushItem(result.item);
    setLoading(false);
  }

  function goBack() {
    setNav((prev) => (prev.index > 0 ? { ...prev, index: prev.index - 1 } : prev));
  }

  function goForward() {
    setNav((prev) => (prev.index < prev.items.length - 1 ? { ...prev, index: prev.index + 1 } : prev));
  }

  const toolbar = (
    <>
      <span className="text-sm text-muted-foreground">
        Repo: <span className="font-mono">{repoName || "…"}</span>
      </span>
      <Input
        value={locaInput}
        onChange={(e) => setLocaInput(e.target.value)}
        placeholder="loca (np. 03/06)"
        className="w-[220px] font-mono"
        onKeyDown={(e) => {
          if (e.key === "Enter") handleGo();
        }}
      />
      <Button variant="outline" size="sm" onClick={goBack} disabled={nav.index <= 0}>
        <ArrowLeft className="h-4 w-4" />
        Wstecz
      </Button>
      <Button variant="outline" size="sm" onClick={goForward} disabled={nav.index >= nav.items.length - 1}>
        Naprzód
        <ArrowRight className="h-4 w-4" />
      </Button>
      <Button variant="outline" size="sm" onClick={handleGo}>
        GO
      </Button>
      {loading && <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />}
    </>
  );

  return (
    <DashboardPageShell toolbar={toolbar}>
      <ErrorBox message={error} className="mb-3" />

      {!currentItem ? (
        <div className="flex items-center gap-2 py-4 text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" />
          <span>Ładowanie...</span>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            <div>
              Address: <span className="font-mono">{currentItem.Address}</span>
            </div>
            <div>
              Type: <span className="font-mono">{currentItem.Config.type}</span>
            </div>
            <div>
              Name: <span className="font-mono">{currentItem.Config.name}</span>
            </div>
          </div>

          {currentItem.Config.type === "Text" && (
            <pre className="whitespace-pre-wrap break-words rounded-md border bg-muted/20 p-3 font-mono text-sm">
              {currentItem.Body || <span className="italic text-muted-foreground">(empty)</span>}
            </pre>
          )}

          {currentItem.Config.type === "Folder" && (
            <div className="space-y-1">
              {parseChildNameMap(currentItem.Body).map(({ index, name }) => (
                <Button
                  key={index}
                  variant="ghost"
                  className="w-full justify-start gap-2"
                  onClick={() => handleChildClick(index)}
                >
                  <span className="font-mono text-xs text-muted-foreground">{index}</span>
                  {name}
                </Button>
              ))}
              {parseChildNameMap(currentItem.Body).length === 0 && (
                <p className="text-sm italic text-muted-foreground">Brak elementów</p>
              )}
            </div>
          )}

          {currentItem.Config.type !== "Text" && currentItem.Config.type !== "Folder" && (
            <p className="text-sm italic text-muted-foreground">
              Nieobsługiwany typ itemu: {currentItem.Config.type}
            </p>
          )}
        </div>
      )}
    </DashboardPageShell>
  );
}
