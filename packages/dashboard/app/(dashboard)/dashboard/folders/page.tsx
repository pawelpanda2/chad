"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardPageShell } from "@/components/shared/dashboard-page-shell";
import { ErrorBox } from "@/components/shared/error-box";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, ArrowRight, RefreshCw } from "lucide-react";

/**
 * Content Provider browser, ported from
 * packages/net-content-provider/front_blazor/BlazorApp/Pages/Repos.razor
 * (+ TextView.razor/FolderView.razor) — see documentation/stories/57,
 * corrected against real reference screenshots of the running Blazor app
 * (Input 3 in 01_input.md) after a first pass omitted too much.
 *
 * Deviations from the screenshots, both deliberate and documented:
 * - No Logout button — the user's ORIGINAL request explicitly said "bez
 *   logout" (the dashboard already has its own, separate Logout in the
 *   sidebar); the screenshot just happens to be of the standalone Blazor
 *   app, which has its own.
 * - Only ONE back button (Wstecz), not Blazor's two (←/↶) — confirmed by
 *   reading the real Blazor source that both call the exact same handler
 *   (dead/duplicate code), not two different features worth replicating.
 * - Folder/Content/Config/Terminal (cp-plugin — local file/terminal
 *   opening) and GoogleDoc/Tts buttons are rendered for visual parity but
 *   disabled — there is no cp-plugin bridge reachable from this web
 *   dashboard's deployment. Add / body-editing Save are rendered but also
 *   disabled — a real write path exists (cp-flow.ts's Put, already used
 *   elsewhere) but wiring it here is a bigger, separate decision (which
 *   repos a given user may WRITE to, not just browse) not yet made.
 * - Repo picker: a real dropdown over ALL repos, but ONLY for the
 *   `pawel_f` login (see /api/folders/repos) — every other user still
 *   only ever sees their own repo, preserving this dashboard's existing
 *   per-user data isolation model, which has no admin/role flag to gate
 *   this more precisely.
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

interface RepoOption {
  id: string;
  name: string;
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

/** Disabled button matching the Blazor screenshot's layout for an action this dashboard can't perform yet (cp-plugin/write). */
function InertButton({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <Button variant="outline" size="sm" disabled title={title}>
      {children}
    </Button>
  );
}

export default function FoldersPage() {
  const [repos, setRepos] = useState<RepoOption[]>([]);
  const [selectedRepoGuid, setSelectedRepoGuid] = useState<string>("");
  const [nav, setNav] = useState<{ items: CpItem[]; index: number }>({ items: [], index: -1 });
  const [locaInput, setLocaInput] = useState("");
  const [addName, setAddName] = useState("");
  const [addType, setAddType] = useState("Text");
  const [editorBody, setEditorBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const currentItem = nav.index >= 0 ? nav.items[nav.index] : null;

  const fetchItem = useCallback(async (repoGuid: string, loca: string): Promise<{ item: CpItem; repoGuid: string } | null> => {
    setError(null);
    try {
      const query = new URLSearchParams({ loca });
      if (repoGuid) query.set("repoGuid", repoGuid);
      const res = await fetch(`/api/folders?${query}`);
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

  // Load the repo list once, then the initial (first/own) repo's root.
  // Wrapped in try/finally — a bare `await` sequence with no catch meant
  // any failure here (repos fetch throwing, non-JSON response, etc.) left
  // `loading` stuck `true` forever with no item ever pushed, which is
  // what actually caused the reported "spins forever until I click GO"
  // (GO starts a fresh, independent request/render cycle that can
  // succeed even if the mount-time one got stuck) — NOT a rendering bug,
  // a swallowed exception. Also now surfaces reposRes' own error instead
  // of silently leaving the repo list empty.
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const reposRes = await fetch("/api/folders/repos");
        const reposData: { repos?: RepoOption[]; error?: string } = await reposRes.json();
        if (!reposRes.ok || !reposData.repos) {
          setError(reposData.error ?? `Failed to load repo list (${reposRes.status})`);
          return;
        }
        setRepos(reposData.repos);

        const initialRepoGuid = reposData.repos[0]?.id ?? "";
        setSelectedRepoGuid(initialRepoGuid);

        const result = await fetchItem(initialRepoGuid, "");
        if (result) pushItem(result.item);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load Folders tab");
      } finally {
        setLoading(false);
      }
    })();
    // Run once on mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (currentItem && selectedRepoGuid) {
      setLocaInput(relativeLoca(currentItem.Address, selectedRepoGuid));
      setEditorBody(currentItem.Body);
    }
  }, [currentItem, selectedRepoGuid]);

  async function handleGo() {
    setLoading(true);
    try {
      const result = await fetchItem(selectedRepoGuid, locaInput);
      if (result) pushItem(result.item);
    } finally {
      setLoading(false);
    }
  }

  async function handleChildClick(childIndex: string) {
    const parentLoca = currentItem ? relativeLoca(currentItem.Address, selectedRepoGuid) : "";
    const childLoca = parentLoca ? `${parentLoca}/${childIndex}` : childIndex;
    setLoading(true);
    try {
      const result = await fetchItem(selectedRepoGuid, childLoca);
      if (result) pushItem(result.item);
    } finally {
      setLoading(false);
    }
  }

  function goBack() {
    setNav((prev) => (prev.index > 0 ? { ...prev, index: prev.index - 1 } : prev));
  }

  function goForward() {
    setNav((prev) => (prev.index < prev.items.length - 1 ? { ...prev, index: prev.index + 1 } : prev));
  }

  return (
    <DashboardPageShell title="Folders">
      <ErrorBox message={error} className="mb-3" />

      {/* Single nested frame wrapping nav + info + item content — previously nav had its own frame separate from the rest, extended per explicit request to cover everything down through the editor. */}
      <div className="space-y-3 rounded-lg border bg-muted/10 p-3">
        <div className="space-y-2 border-b pb-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">Repo::</span>
            {/*
              Security (backlog/stories/60): this dropdown may only ever
              show/select the current user's own repo. The backend
              (/api/folders/repos, via dba's strict resolveOwnRepo()) never
              returns more than one repo, but the control is ALSO disabled
              here as defense-in-depth UX — there must be no way to type or
              pick a different value even if that ever changed. This does
              NOT replace the server-side enforcement in packages/dba; it is
              purely a UX safeguard.
            */}
            <Select value={selectedRepoGuid} disabled>
              <SelectTrigger className="w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {repos.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">Loca::</span>
            <Input
              value={locaInput}
              onChange={(e) => setLocaInput(e.target.value)}
              placeholder="03/06"
              className="w-[220px] font-mono"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleGo();
              }}
            />
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={goBack} disabled={nav.index <= 0} title="Wstecz">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={handleGo}>
              GO
            </Button>
            <Button variant="outline" size="sm" onClick={goForward} disabled={nav.index >= nav.items.length - 1} title="Naprzód">
              <ArrowRight className="h-4 w-4" />
            </Button>
            {loading && <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
        </div>

        {!currentItem && loading ? (
          <div className="flex items-center gap-2 py-4 text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span>Ładowanie...</span>
          </div>
        ) : !currentItem ? (
          <p className="py-4 text-sm italic text-muted-foreground">
            Nie udało się załadować żadnego itemu — sprawdź błąd powyżej i spróbuj ponownie (np. przyciskiem GO).
          </p>
        ) : (
          <div className="space-y-3">
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
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <InertButton title="Wymaga cp-plugin — niedostępne w dashboardzie">Folder</InertButton>
                <InertButton title="Wymaga cp-plugin — niedostępne w dashboardzie">Content</InertButton>
                <InertButton title="Wymaga cp-plugin — niedostępne w dashboardzie">Config</InertButton>
                <InertButton title="Wymaga cp-plugin — niedostępne w dashboardzie">Terminal</InertButton>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Select defaultValue="Open" disabled>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Open">Open</SelectItem>
                    <SelectItem value="Recreate">Recreate</SelectItem>
                  </SelectContent>
                </Select>
                <InertButton title="GoogleDoc — niepodłączone w dashboardzie">GoogleDoc</InertButton>
                <InertButton title="Tts — niepodłączone w dashboardzie">Tts</InertButton>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <InertButton title="Zapis nie jest jeszcze obsługiwany w dashboardzie">Add</InertButton>
                <Select value={addType} onValueChange={setAddType} disabled>
                  <SelectTrigger className="w-[100px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Text">Up</SelectItem>
                    <SelectItem value="Folder">Down</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  placeholder="nazwa"
                  disabled
                  className="w-[200px]"
                />
              </div>

              <Tabs defaultValue="preview">
                <TabsList>
                  <TabsTrigger value="preview">Podgląd</TabsTrigger>
                  <TabsTrigger value="editor">Edytor</TabsTrigger>
                </TabsList>
                <TabsContent value="preview">
                  <pre className="whitespace-pre-wrap break-words rounded-md border bg-muted/20 p-3 font-mono text-sm">
                    {currentItem.Body || <span className="italic text-muted-foreground">(empty)</span>}
                  </pre>
                </TabsContent>
                <TabsContent value="editor">
                  <Textarea
                    value={editorBody}
                    onChange={(e) => setEditorBody(e.target.value)}
                    className="min-h-[300px] font-mono text-sm"
                    disabled
                    title="Zapis nie jest jeszcze obsługiwany w dashboardzie"
                  />
                </TabsContent>
              </Tabs>
            </div>
          )}

          {currentItem.Config.type === "Folder" && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <InertButton title="Wymaga cp-plugin — niedostępne w dashboardzie">Folder</InertButton>
                <InertButton title="Wymaga cp-plugin — niedostępne w dashboardzie">Config</InertButton>
                <InertButton title="Wymaga cp-plugin — niedostępne w dashboardzie">Terminal</InertButton>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <InertButton title="Zapis nie jest jeszcze obsługiwany w dashboardzie">Add</InertButton>
                <Select value={addType} onValueChange={setAddType} disabled>
                  <SelectTrigger className="w-[100px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Text">Text</SelectItem>
                    <SelectItem value="Folder">Folder</SelectItem>
                    <SelectItem value="Ref">Ref</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  placeholder="nazwa"
                  disabled
                  className="w-[200px]"
                />
              </div>

              <div className="space-y-1">
                {parseChildNameMap(currentItem.Body).map(({ index, name }) => (
                  <div key={index} className="flex items-center gap-2">
                    <span className="w-8 shrink-0 font-mono text-xs text-muted-foreground">{index}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="justify-start"
                      onClick={() => handleChildClick(index)}
                    >
                      {name}
                    </Button>
                  </div>
                ))}
                {parseChildNameMap(currentItem.Body).length === 0 && (
                  <p className="text-sm italic text-muted-foreground">Brak elementów</p>
                )}
              </div>
            </div>
          )}

          {currentItem.Config.type !== "Text" && currentItem.Config.type !== "Folder" && (
            <p className="text-sm italic text-muted-foreground">
              Nieobsługiwany typ itemu: {currentItem.Config.type}
            </p>
          )}
          </div>
        )}
      </div>
    </DashboardPageShell>
  );
}
