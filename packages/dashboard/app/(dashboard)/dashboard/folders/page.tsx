"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardPageShell } from "@/components/shared/dashboard-page-shell";
import { ErrorBox } from "@/components/shared/error-box";
import { TextEditorWithToolbar } from "@/components/shared/text-editor-with-toolbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, RefreshCw, Lock, Unlock, Trash2 } from "lucide-react";

// One of these is picked at random each time the delete confirmation dialog
// opens, so the user must actually read and retype it rather than
// muscle-memory a fixed word — same pattern as the Daily/Date Entry delete
// confirmation on the Forms page (Story 62 Round 8).
const DELETE_CONFIRM_WORDS = ["DELETE", "CONFIRM", "USUN", "PERMANENT"];

/**
 * Content Provider browser, ported from
 * packages/net-content-provider/front_blazor/BlazorApp/Pages/Repos.razor
 * (+ TextView.razor/FolderView.razor) — see documentation/stories/57,
 * corrected against real reference screenshots of the running Blazor app
 * (Input 3 in 01_input.md) after a first pass omitted too much. Story 82
 * added the first real write path (create Text/Folder child, edit+save a
 * Text item's body) — previously GET-only with Add/Save rendered disabled.
 *
 * Deviations from the screenshots, both deliberate and documented:
 * - No Logout button — the user's ORIGINAL request explicitly said "bez
 *   logout" (the dashboard already has its own, separate Logout in the
 *   sidebar); the screenshot just happens to be of the standalone Blazor
 *   app, which has its own.
 * - Only ONE back button (Wstecz), not Blazor's two (←/↶) — confirmed by
 *   reading the real Blazor source that both call the exact same handler
 *   (dead/duplicate code), not two different features worth replicating.
 * - Content/Terminal (cp-plugin — local file/terminal opening) and
 *   Open/Recreate/GoogleDoc/Tts buttons were dropped entirely (Story 95,
 *   removed rather than kept as disabled stubs) — there is no cp-plugin
 *   bridge reachable from this web dashboard's deployment, and none of
 *   them do anything real here.
 * - Text item's "Add" row (Blazor: Up/Down select + input) is REMOVED, not
 *   wired up: reading `TextView.razor`'s real `OnAddClicked` shows it calls
 *   an unrelated operation (`ItemWorker.AppendLine`), not
 *   `PostParentItem`/child-creation — the "Up"/"Down" select isn't even
 *   read by that handler. No confirmed, safe create-child semantics exist
 *   for a Text item, so per Story 82's task instructions this form is left
 *   out entirely rather than wired to the wrong operation or kept as a
 *   misleading disabled stub.
 * - Folder's "Add" type select offers Text/Folder only — Ref is
 *   intentionally excluded (Story 82: no confirmed contract for it here).
 * - Repo picker (Story 96): the dropdown holds exactly the repos the
 *   backend session grants (see /api/folders/repos → dba's
 *   listSelectableFoldersRepos) — every user's own repo, plus the shared
 *   `chad_shared` repo for admin sessions only. Every /api/folders verb
 *   re-validates the selected repo server-side (resolveFoldersRepoAccess),
 *   so this control is UX, never the enforcement point.
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

interface CreateChildApiResponse {
  item?: CpItem;
  parent?: CpItem;
  alreadyExisted?: boolean;
  error?: string;
  details?: string;
}

interface UpdateBodyApiResponse {
  item?: CpItem;
  error?: string;
  details?: string;
}

interface UpdateConfigApiResponse {
  item?: CpItem;
  error?: string;
  details?: string;
}

/** Which panel the item view shows — independent of item type (Text or Folder), toggled by the Config/Body button next to Delete. */
type EditorMode = "body" | "config";

interface RepoOption {
  id: string;
  name: string;
}

interface ReadOnlyFolderRow {
  address: string;
  managedBy: string;
  reason: string;
}

interface ReadOnlyFoldersApiResponse {
  success: boolean;
  data?: ReadOnlyFolderRow[];
  canUnlock?: boolean;
  currentUser?: {
    username: string;
    role: "admin" | "user";
  };
}

/**
 * Finds the read-only-folder row (if any) that protects `namePath` —
 * either an exact match or a descendant of one (e.g. `views/daily/01`
 * under `views/daily`). Mirrors `dba`'s own `findProtectingSystemFolder`
 * (server-side enforcement lives there; this is purely an informational
 * banner) without importing the server-only `dba` package into a client
 * component.
 */
function findProtectingReadOnlyFolder(namePath: string[], rows: ReadOnlyFolderRow[]): ReadOnlyFolderRow | null {
  const joined = namePath.join("/");
  for (const row of rows) {
    if (joined === row.address || joined.startsWith(`${row.address}/`)) return row;
  }
  return null;
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
  const [repos, setRepos] = useState<RepoOption[]>([]);
  const [selectedRepoGuid, setSelectedRepoGuid] = useState<string>("");
  const [nav, setNav] = useState<{ items: CpItem[]; index: number }>({ items: [], index: -1 });
  const [locaInput, setLocaInput] = useState("");
  const [addName, setAddName] = useState("");
  const [addType, setAddType] = useState("Text");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createNotice, setCreateNotice] = useState<string | null>(null);
  const [editorBody, setEditorBody] = useState("");
  const [savingBody, setSavingBody] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [bodySaved, setBodySaved] = useState(false);
  const [editorMode, setEditorMode] = useState<EditorMode>("body");
  const [configText, setConfigText] = useState("");
  const [savingConfig, setSavingConfig] = useState(false);
  const [configSaveError, setConfigSaveError] = useState<string | null>(null);
  const [configSaved, setConfigSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [readOnlyFolders, setReadOnlyFolders] = useState<ReadOnlyFolderRow[]>([]);
  const [canUnlockSystemFolders, setCanUnlockSystemFolders] = useState(false);
  const [unlockedFolderAddresses, setUnlockedFolderAddresses] = useState<string[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmWord, setDeleteConfirmWord] = useState("");
  const [deleteConfirmInput, setDeleteConfirmInput] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const currentItem = nav.index >= 0 ? nav.items[nav.index] : null;
  // nav.items[0] is the repo root itself (never a registered system
  // folder) — the name path system-folders.ts compares against starts
  // from its children (e.g. ["views", "daily"]).
  const currentNamePath = nav.items.slice(1, nav.index + 1).map((item) => item.Config.name);
  const protectingFolder = findProtectingReadOnlyFolder(currentNamePath, readOnlyFolders);
  const isProtectedWriteUnlocked = Boolean(
    protectingFolder && unlockedFolderAddresses.includes(protectingFolder.address)
  );

  useEffect(() => {
    fetch("/api/settings/read-only-folders")
      .then((res) => res.json())
      .then((json: ReadOnlyFoldersApiResponse) => {
        if (json.success && json.data) {
          setReadOnlyFolders(json.data);
          setCanUnlockSystemFolders(json.canUnlock === true);
        }
      })
      .catch(() => {
        // Purely informational banner — a failed fetch here must never block browsing Folders.
      });
  }, []);

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

  /** Replaces the currently-shown item in place (no new history entry) — used after create/save refreshes. */
  const replaceCurrentItem = useCallback((item: CpItem) => {
    setNav((prev) => {
      if (prev.index < 0) return prev;
      const items = [...prev.items];
      items[prev.index] = item;
      return { ...prev, items };
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

  // Reset editor/nav UI when the *shown address* changes (real navigation),
  // not on in-place replace after save/create — otherwise Save's "Saved"
  // flash (and an unsaved Text edit) would be wiped by our own refresh.
  useEffect(() => {
    if (currentItem && selectedRepoGuid) {
      setLocaInput(relativeLoca(currentItem.Address, selectedRepoGuid));
      setEditorBody(currentItem.Body);
      setAddName("");
      setCreateError(null);
      setCreateNotice(null);
      setSaveError(null);
      setBodySaved(false);
      setEditorMode("body");
      setConfigText(JSON.stringify(currentItem.Config, null, 2));
      setConfigSaveError(null);
      setConfigSaved(false);
    }
    // Intentionally keyed on Address, not the whole currentItem object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentItem?.Address, selectedRepoGuid]);

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

  /** Switches to another repo from the session-granted list (own repo, or chad_shared for admins) and loads its root fresh. */
  async function handleRepoChange(repoGuid: string) {
    if (repoGuid === selectedRepoGuid) return;
    setSelectedRepoGuid(repoGuid);
    setNav({ items: [], index: -1 });
    setLocaInput("");
    setLoading(true);
    try {
      const result = await fetchItem(repoGuid, "");
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

  /**
   * Creates a Text/Folder child under the current Folder. Mirrors
   * `FolderView.razor`'s real `OnAddClicked`: stays on the current folder
   * and refreshes its children in place, rather than navigating into the
   * new item (that handler re-fetches `Item.AdrTuple`, the parent itself,
   * never the child it just created).
   */
  async function handleAddChild() {
    if (!currentItem || creating || (protectingFolder && !isProtectedWriteUnlocked)) return;
    const trimmedName = addName.trim();
    if (!trimmedName) {
      setCreateError("Nazwa nie może być pusta");
      return;
    }

    setCreating(true);
    setCreateError(null);
    setCreateNotice(null);
    try {
      const parentLoca = relativeLoca(currentItem.Address, selectedRepoGuid);
      const res = await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentLoca,
          type: addType,
          name: trimmedName,
          allowSystemFolderWrite: isProtectedWriteUnlocked,
          repoGuid: selectedRepoGuid,
        }),
      });
      const data: CreateChildApiResponse = await res.json();
      if (!res.ok || !data.parent) {
        setCreateError(data.details ?? data.error ?? `Request failed (${res.status})`);
        return;
      }

      replaceCurrentItem(data.parent);
      setAddName("");
      if (data.alreadyExisted) {
        setCreateNotice(`Element "${trimmedName}" już istnieje — otwarto istniejący.`);
      }
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Nie udało się utworzyć elementu");
    } finally {
      setCreating(false);
    }
  }

  /** Saves the Text editor's body. Mirrors `CodeEditorTabs.razor`'s Save: only meaningful while editing, never clobbers unsaved text on failure. */
  async function handleSaveBody() {
    if (!currentItem || savingBody || (protectingFolder && !isProtectedWriteUnlocked)) return;
    const loca = relativeLoca(currentItem.Address, selectedRepoGuid);

    setSavingBody(true);
    setSaveError(null);
    setBodySaved(false);
    try {
      const res = await fetch("/api/folders", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loca, body: editorBody, allowSystemFolderWrite: isProtectedWriteUnlocked, repoGuid: selectedRepoGuid }),
      });
      const data: UpdateBodyApiResponse = await res.json();
      if (!res.ok || !data.item) {
        setSaveError(data.details ?? data.error ?? `Request failed (${res.status})`);
        return;
      }

      replaceCurrentItem(data.item);
      setBodySaved(true);
      setTimeout(() => setBodySaved(false), 3000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Nie udało się zapisać");
    } finally {
      setSavingBody(false);
    }
  }

  function handleEditorBodyChange(value: string) {
    setEditorBody(value);
    if (bodySaved) setBodySaved(false);
  }

  function toggleEditorMode() {
    setEditorMode((prev) => (prev === "body" ? "config" : "body"));
  }

  function handleConfigTextChange(value: string) {
    setConfigText(value);
    if (configSaved) setConfigSaved(false);
  }

  /** Saves the Config editor's JSON. Never touches `editorBody`/body-save state — config and body are independent drafts and independent saves. */
  async function handleSaveConfig() {
    if (!currentItem || savingConfig || (protectingFolder && !isProtectedWriteUnlocked)) return;
    const loca = relativeLoca(currentItem.Address, selectedRepoGuid);

    let parsedConfig: unknown;
    try {
      parsedConfig = JSON.parse(configText);
    } catch (err) {
      setConfigSaveError(err instanceof Error ? `Nieprawidłowy JSON: ${err.message}` : "Nieprawidłowy JSON");
      return;
    }

    setSavingConfig(true);
    setConfigSaveError(null);
    setConfigSaved(false);
    try {
      const res = await fetch("/api/folders/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loca, config: parsedConfig, allowSystemFolderWrite: isProtectedWriteUnlocked, repoGuid: selectedRepoGuid }),
      });
      const data: UpdateConfigApiResponse = await res.json();
      if (!res.ok || !data.item) {
        setConfigSaveError(data.details ?? data.error ?? `Request failed (${res.status})`);
        return;
      }

      replaceCurrentItem(data.item);
      setConfigText(JSON.stringify(data.item.Config, null, 2));
      setConfigSaved(true);
      setTimeout(() => setConfigSaved(false), 3000);
    } catch (err) {
      setConfigSaveError(err instanceof Error ? err.message : "Nie udało się zapisać");
    } finally {
      setSavingConfig(false);
    }
  }

  function toggleProtectedWriteUnlock() {
    if (!protectingFolder || !canUnlockSystemFolders) return;
    setUnlockedFolderAddresses((prev) =>
      prev.includes(protectingFolder.address)
        ? prev.filter((address) => address !== protectingFolder.address)
        : [...prev, protectingFolder.address]
    );
  }

  function openDeleteDialog() {
    setDeleteConfirmWord(DELETE_CONFIRM_WORDS[Math.floor(Math.random() * DELETE_CONFIRM_WORDS.length)]);
    setDeleteConfirmInput("");
    setDeleteError(null);
    setDeleteDialogOpen(true);
  }

  /**
   * Permanently deletes the currently-open item (Text, or an empty Folder —
   * the API refuses a non-empty Folder with 409 FOLDER_NOT_EMPTY, never
   * cascading). Retype-a-random-word confirmation mirrors the Forms page's
   * Daily/Date Entry delete (Story 62 Round 8) — see DELETE_CONFIRM_WORDS.
   */
  async function handleDeleteItem() {
    if (!currentItem || deleting || deleteConfirmInput.trim() !== deleteConfirmWord) return;
    const loca = relativeLoca(currentItem.Address, selectedRepoGuid);
    if (!loca) {
      setDeleteError("Nie można usunąć głównego folderu repo");
      return;
    }

    setDeleting(true);
    setDeleteError(null);
    try {
      const query = new URLSearchParams({ loca });
      if (selectedRepoGuid) query.set("repoGuid", selectedRepoGuid);
      if (isProtectedWriteUnlocked) query.set("allowSystemFolderWrite", "true");
      const res = await fetch(`/api/folders?${query}`, { method: "DELETE" });
      const data: { success?: boolean; parent?: CpItem | null; error?: string; details?: string } = await res.json();
      if (!res.ok || !data.success) {
        setDeleteError(data.details ?? data.error ?? `Request failed (${res.status})`);
        return;
      }

      toast.success("Element usunięty");
      setDeleteDialogOpen(false);
      if (data.parent) {
        pushItem(data.parent);
      } else {
        goBack();
      }
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Nie udało się usunąć");
    } finally {
      setDeleting(false);
    }
  }

  // Config Save's disabled/error state — computed on every render (cheap,
  // no I/O) rather than in an effect, since it only derives from already-
  // in-memory state and must stay in sync with keystrokes immediately.
  let configParseError: string | null = null;
  try {
    JSON.parse(configText);
  } catch (err) {
    configParseError = err instanceof Error ? err.message : "Nieprawidłowy JSON";
  }
  const configDirty = currentItem ? configText !== JSON.stringify(currentItem.Config, null, 2) : false;
  const configSaveDisabled =
    Boolean(configParseError) || !configDirty || savingConfig || Boolean(protectingFolder && !isProtectedWriteUnlocked);

  const configEditorBlock = (
    <div className="space-y-2">
      <ErrorBox message={configParseError ?? configSaveError} className="mb-0" />
      <TextEditorWithToolbar
        value={configText}
        onChange={handleConfigTextChange}
        onSave={handleSaveConfig}
        saving={savingConfig}
        saved={configSaved}
        saveDisabled={configSaveDisabled}
        showPreview={false}
        defaultTab="editor"
        showSave={!protectingFolder || isProtectedWriteUnlocked}
        placeholder="Enter config JSON..."
        className="min-h-[360px] h-[50vh]"
      />
    </div>
  );

  return (
    <DashboardPageShell title="Folders">
      <ErrorBox message={error} className="mb-3" />

      {/* Single nested frame wrapping nav + info + item content — previously nav had its own frame separate from the rest, extended per explicit request to cover everything down through the editor. */}
      <div className="space-y-3 rounded-lg border bg-muted/10 p-3">
        <div className="space-y-2 border-b pb-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">Repo::</span>
            {/*
              Security (backlog/stories/60, extended in 96): this dropdown
              only ever holds the repos the backend session granted
              (/api/folders/repos) — the user's own repo, plus chad_shared
              for admin sessions. It stays disabled while there is nothing
              to switch to, and it is NOT the enforcement point: every
              /api/folders request re-validates the selected repo
              server-side (dba's resolveFoldersRepoAccess), so a forged
              value here cannot reach another repo.
            */}
            <Select
              value={selectedRepoGuid}
              onValueChange={handleRepoChange}
              disabled={repos.length <= 1 || loading}
            >
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

            {protectingFolder && (
              <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
                {canUnlockSystemFolders && (
                  <Button
                    type="button"
                    variant={isProtectedWriteUnlocked ? "default" : "outline"}
                    size="sm"
                    className="h-7 shrink-0"
                    onClick={toggleProtectedWriteUnlock}
                  >
                    <Unlock className="mr-1 h-3.5 w-3.5" />
                    {isProtectedWriteUnlocked ? "Zablokuj" : "Odblokuj"}
                  </Button>
                )}
                <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Managed by <strong>{protectingFolder.managedBy}</strong> — {protectingFolder.reason} Writes here are
                  {isProtectedWriteUnlocked ? " temporarily unblocked for this admin session." : " blocked from this Folders browser."}
                </span>
              </div>
            )}

            {currentItem.Config.type === "Text" && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={openDeleteDialog}
                  disabled={Boolean(protectingFolder && !isProtectedWriteUnlocked)}
                  title={
                    protectingFolder && !isProtectedWriteUnlocked
                      ? `Managed by ${protectingFolder.managedBy} — read-only here`
                      : "Permanently deletes this item"
                  }
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                  Delete
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={toggleEditorMode}>
                  {editorMode === "body" ? "Config" : "Body"}
                </Button>
              </div>
              {editorMode === "body" && (
                <>
                  <ErrorBox message={saveError} className="mb-0" />

                  <TextEditorWithToolbar
                    value={editorBody}
                    onChange={handleEditorBodyChange}
                    onSave={handleSaveBody}
                    saving={savingBody}
                    saved={bodySaved}
                    showSave={!protectingFolder || isProtectedWriteUnlocked}
                    placeholder="Enter text body..."
                    className="min-h-[360px] h-[50vh]"
                  />
                </>
              )}
              {editorMode === "config" && configEditorBlock}
            </div>
          )}

          {currentItem.Config.type === "Folder" && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={openDeleteDialog}
                  disabled={Boolean(protectingFolder && !isProtectedWriteUnlocked)}
                  title={
                    protectingFolder && !isProtectedWriteUnlocked
                      ? `Managed by ${protectingFolder.managedBy} — read-only here`
                      : "Permanently deletes this folder (must be empty)"
                  }
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                  Delete
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={toggleEditorMode}>
                  {editorMode === "body" ? "Config" : "Body"}
                </Button>
              </div>
              {editorMode === "body" && (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      onClick={handleAddChild}
                      disabled={creating || Boolean(protectingFolder && !isProtectedWriteUnlocked)}
                      title={
                        protectingFolder && !isProtectedWriteUnlocked
                          ? `Managed by ${protectingFolder.managedBy} — read-only here`
                          : undefined
                      }
                    >
                      {creating ? "Dodawanie..." : "Add"}
                    </Button>
                    <Select
                      value={addType}
                      onValueChange={setAddType}
                      disabled={creating || Boolean(protectingFolder && !isProtectedWriteUnlocked)}
                    >
                      <SelectTrigger className="w-[100px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Text">Text</SelectItem>
                        <SelectItem value="Folder">Folder</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      value={addName}
                      onChange={(e) => setAddName(e.target.value)}
                      placeholder="nazwa"
                      disabled={creating || Boolean(protectingFolder && !isProtectedWriteUnlocked)}
                      className="w-[200px]"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleAddChild();
                      }}
                    />
                  </div>
                  <ErrorBox message={createError} className="mb-0" />
                  {createNotice && <p className="text-sm text-muted-foreground italic">{createNotice}</p>}

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
                </>
              )}
              {editorMode === "config" && configEditorBlock}
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

      {/* Delete confirmation — retype a randomly-picked word, same pattern
          as the Forms page's Daily/Date Entry delete (Story 62 Round 8). */}
      <Dialog open={deleteDialogOpen} onOpenChange={(open) => !deleting && setDeleteDialogOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this item?</DialogTitle>
            <DialogDescription>
              This permanently removes{" "}
              <span className="font-mono">{currentItem?.Config.name}</span>. This can&apos;t be undone.
              {currentItem?.Config.type === "Folder" && " A non-empty folder cannot be deleted."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm">
              Type <span className="font-mono font-bold">{deleteConfirmWord}</span> to confirm.
            </p>
            <Input
              value={deleteConfirmInput}
              onChange={(e) => setDeleteConfirmInput(e.target.value)}
              placeholder={deleteConfirmWord}
              autoFocus
            />
            <ErrorBox message={deleteError} className="mb-0" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteItem}
              disabled={deleting || deleteConfirmInput.trim() !== deleteConfirmWord}
            >
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardPageShell>
  );
}
