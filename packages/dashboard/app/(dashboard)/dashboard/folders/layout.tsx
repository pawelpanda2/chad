"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { DashboardPageShell } from "@/components/shared/dashboard-page-shell";
import { useDashboardHistory } from "@/components/shared/dashboard-history-provider";
import { ErrorBox } from "@/components/shared/error-box";
import { TextEditorWithToolbar } from "@/components/shared/text-editor-with-toolbar";
import { parseFolderChildNameMap, type FolderSorting } from "@/components/folders/folder-sorting";
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
import { ArrowLeft, ArrowRight, RefreshCw, Lock, Unlock, Trash2, Copy, Upload, FolderInput, MoreHorizontal } from "lucide-react";
import { cpAddressToFoldersHref, cpRouteSlugToAddress } from "@/lib/cp-address/route-codec";
import { getLastCpAddress, setLastCpAddress, clearLastCpAddress } from "@/lib/cp-address/last-address-store";

const FOLDERS_BASE_PATH = "/dashboard/folders";

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
 * - Repo picker (Story 96, opened to every user in a later follow-up): the
 *   dropdown holds exactly the repos the backend session grants (see
 *   /api/folders/repos → dba's listSelectableFoldersRepos) — every user's
 *   own repo, plus the shared `chad_shared` repo. Every /api/folders verb
 *   re-validates the selected repo server-side (resolveFoldersRepoAccess),
 *   so this control is UX, never the enforcement point.
 */

interface CpConfig {
  id: string;
  type: string;
  name: string;
  address: string;
  /** Folder-only, optional, GUI-only — see folder-sorting.ts. Missing/invalid falls back to "asc". */
  sorting?: FolderSorting;
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

interface ImportValidationErrorDetail {
  code: string;
  path: string;
  message: string;
}

interface ImportApiResponse {
  success?: boolean;
  createdRootAddress?: string;
  createdItemCount?: number;
  skipped?: ImportValidationErrorDetail[];
  parent?: CpItem;
  error?: string;
  details?: string;
  validationErrors?: ImportValidationErrorDetail[];
}

/**
 * Mirrors `packages/content-provider/postgre`... no — mirrors the server's
 * own classification logic (`dba/src/cp-import.ts`'s `SKIP_POLICY`): only
 * `type: "Ref"` and `.wav`/`.bak` unexpected files are ever skippable. Kept
 * in sync by hand (small, stable, server-verified either way — a wrong
 * client-side guess here only offers a confirm dialog that the server would
 * then correctly re-reject, never a security question).
 */
function isSkippableImportError(err: ImportValidationErrorDetail): boolean {
  if (err.code === "UNSUPPORTED_TYPE") {
    const m = /Unsupported type "([^"]+)"/.exec(err.message);
    return m?.[1] === "Ref";
  }
  if (err.code === "UNEXPECTED_FILE") {
    const dot = err.path.lastIndexOf(".");
    const ext = dot >= 0 ? err.path.slice(dot + 1).toLowerCase() : "";
    return ext === "wav" || ext === "bak";
  }
  return false;
}

interface UpdateConfigApiResponse {
  item?: CpItem;
  error?: string;
  details?: string;
}

interface MoveApiResponse {
  item?: CpItem;
  moved?: boolean;
  parent?: CpItem | null;
  error?: string;
  details?: string;
}

/** Which panel the item view shows — independent of item type (Text or Folder), toggled by the Config/Body button next to Delete. */
type EditorMode = "body" | "config";

/** Transport-form values `GET /api/folders/export` accepts — matches `dba`'s `FolderExportMode` (Story 98). */
type FolderExportMode = "body-l1" | "body-l2" | "all-l1";

interface FolderExportApiResponse {
  export?: { mode: string; items: unknown[] };
  itemCount?: number;
  error?: string;
  details?: string;
}

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


/**
 * Story 120 follow-up: moved from `page.tsx` into a `layout.tsx` so the SAME
 * component instance (and its React state — `currentItem`, `strippedLocaSegments`,
 * `ancestorNamePath`, etc.) persists across navigation between the sibling
 * routes `/dashboard/folders` and `/dashboard/folders/[slug]`. A plain
 * `page.tsx` re-export (the original approach) does NOT do this: Next's App
 * Router remounts the page's Server Component boundary whenever the dynamic
 * `[slug]` segment's value changes, which silently reset every piece of
 * local state that has no representation in the URL itself (discovered via
 * live testing — the structural Wstecz/Naprzod redo stack was being wiped
 * after every single Wstecz click, even though the URL/content kept
 * resolving correctly since that part re-derives from the URL on every
 * mount). A `layout.tsx`, by contrast, is exactly the part of the route
 * tree Next.js guarantees stays mounted across navigation within the same
 * subtree — the correct, idiomatic fix, not a workaround. `folders/page.tsx`
 * and `folders/[slug]/page.tsx` are now trivial leaves (`return null`) that
 * exist only so Next has something routable at each path; this component
 * renders the entire Folders UI itself and intentionally does not render
 * `children` (there is no meaningful nested content to show underneath).
 */
export default function FoldersLayout({ children }: { children?: React.ReactNode }) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  void children;
  // Story 120: the URL is the source of truth for the current CP Item —
  // read reactively via usePathname() (not a one-time params prop) so the
  // SAME component instance correctly serves the base `/dashboard/folders`
  // route AND `/dashboard/folders/<slug>` (see the sibling `[slug]/page.tsx`,
  // which just re-exports this component — no duplicated Folders GUI) and
  // reacts to router.push/replace and browser Back/Forward alike.
  const pathname = usePathname();
  const router = useRouter();
  const { notifyReplace, goBack: sharedGoBack } = useDashboardHistory();
  const [repos, setRepos] = useState<RepoOption[]>([]);
  const [selectedRepoGuid, setSelectedRepoGuid] = useState<string>("");
  const [currentItem, setCurrentItem] = useState<CpItem | null>(null);
  // Ancestor Config.name trail from the repo root to currentItem (exclusive
  // of the root, inclusive of currentItem) — a small LOCAL CACHE for the
  // pre-existing system-folder read-only banner (findProtectingReadOnlyFolder
  // below), which matches by logical name path, not by numeric address.
  // This is NOT a history/back-forward mechanism (that's the shared
  // DashboardHistoryProvider via the URL now) — it only accumulates while
  // clicking through children in this mounted session and resets on any
  // other kind of jump (GO/deep-link/CP-link/repo-change/parent-after-
  // move-or-delete), same as it already did before this Story for anything
  // but a plain child click.
  const [ancestorNamePath, setAncestorNamePath] = useState<string[]>([]);
  const [notFound, setNotFound] = useState(false);
  // The small Wstecz/Naprzod arrows around GO — a STRUCTURAL address-tree
  // up/down, distinct from the shared, cross-page DashboardHistoryProvider
  // (NavGroup's Back/Forw, above the frame). Wstecz strips the current
  // item's LAST loca segment (e.g. `14/07/02/01` -> `14/07/02`, pushing
  // "01" here) — same as a file browser's "up one level". Naprzod pops the
  // most recently stripped segment and appends it back. This is a real
  // undo/redo STACK, not a single slot: N consecutive Wstecz clicks push N
  // segments, so N consecutive Naprzod clicks exactly retrace them back
  // down, in order — Wstecz always just pushes (safe even after a partial
  // Naprzod: since Naprzod only ever restores exactly the loca state a
  // matching Wstecz produced, a fresh Wstecz from there reproduces the same
  // stack it would have had, no special-case branching needed). The whole
  // stack is cleared by any OTHER navigation (child click, GO, CP-link,
  // repo change, move/delete) via `navigateToCpItem`'s own default. Every
  // step here still goes through `navigateToCpItem`, so the canonical URL
  // updates and the shared history observes it exactly like any other
  // navigation.
  const [strippedLocaSegments, setStrippedLocaSegments] = useState<string[]>([]);
  const [locaInput, setLocaInput] = useState("");
  const [addName, setAddName] = useState("");
  const [addType, setAddType] = useState("Text");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createNotice, setCreateNotice] = useState<string | null>(null);
  const [importPhase, setImportPhase] = useState<"idle" | "uploading" | "processing">("idle");
  const [importError, setImportError] = useState<string | null>(null);
  const [importSkipConfirm, setImportSkipConfirm] = useState<{ file: File; skippable: ImportValidationErrorDetail[]; blocking: ImportValidationErrorDetail[] } | null>(null);
  const importFileInputRef = useRef<HTMLInputElement>(null);
  const [editorBody, setEditorBody] = useState("");
  // Set together with `editorBody` in the reset effect below (never on its
  // own) — used only as TextEditorWithToolbar's `key` so it remounts (and
  // re-runs Preview format auto-detection) exactly once `editorBody` has
  // actually caught up to the newly-loaded item, not one render tick
  // earlier while `editorBody` still holds the PREVIOUS item's Body.
  const [editorSyncKey, setEditorSyncKey] = useState<string | null>(null);
  const [savingBody, setSavingBody] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [bodySaved, setBodySaved] = useState(false);
  const [editorMode, setEditorMode] = useState<EditorMode>("body");
  const [configText, setConfigText] = useState("");
  const [savingConfig, setSavingConfig] = useState(false);
  const [configSaveError, setConfigSaveError] = useState<string | null>(null);
  const [configSaved, setConfigSaved] = useState(false);
  const [exportMode, setExportMode] = useState<FolderExportMode>("body-l1");
  const [copying, setCopying] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [readOnlyFolders, setReadOnlyFolders] = useState<ReadOnlyFolderRow[]>([]);
  const [canUnlockSystemFolders, setCanUnlockSystemFolders] = useState(false);
  const [unlockedFolderAddresses, setUnlockedFolderAddresses] = useState<string[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  /** `confirm-word` = type DELETE; `confirm-recursive` = second Yes for non-empty Folder. */
  const [deleteStep, setDeleteStep] = useState<"confirm-word" | "confirm-recursive">("confirm-word");
  const [deleteConfirmWord, setDeleteConfirmWord] = useState("");
  const [deleteConfirmInput, setDeleteConfirmInput] = useState("");
  const [deleteChildCount, setDeleteChildCount] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [moveTargetLoca, setMoveTargetLoca] = useState("");
  const [moving, setMoving] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [showMoreActions, setShowMoreActions] = useState(false);
  const [dragMoveConfirm, setDragMoveConfirm] = useState<{
    sourceAddress: string;
    sourceName: string;
    targetAddress: string;
    targetName: string;
  } | null>(null);
  const [dragMoving, setDragMoving] = useState(false);
  const [dragMoveError, setDragMoveError] = useState<string | null>(null);
  const [draggedChild, setDraggedChild] = useState<{ index: string; name: string } | null>(null);

  const protectingFolder = findProtectingReadOnlyFolder(ancestorNamePath, readOnlyFolders);
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

  // Mirrors of `repos`/`username` state, kept in sync at the point each is
  // set — read by the pathname-reactive effect below (browser/NavGroup
  // Back-Forward) so it never has to wait on a second render just to see
  // data the mount effect already fetched, and never needs them in its own
  // dependency array (which would otherwise re-run it on every unrelated
  // repo/session state change).
  const reposRef = useRef<RepoOption[]>([]);
  const usernameRef = useRef<string | null>(null);
  // The pathname this page's OWN navigateToCpItem last pushed/replaced —
  // lets the pathname-reactive effect tell "the URL changed because we
  // just navigated ourselves" (already applied, nothing to do) apart from
  // "the URL changed some other way" (browser/NavGroup Back-Forward, or a
  // fresh SPA navigation onto this same route from elsewhere) — the latter
  // is the only case that needs to actually resolve+display a (possibly
  // different) item.
  const appliedPathnameRef = useRef<string | null>(null);

  const fetchItem = useCallback(async (repoGuid: string, loca: string): Promise<{ item: CpItem; repoGuid: string; username: string } | null> => {
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
      return { item: data.item, repoGuid: data.repoGuid, username: data.username ?? "" };
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reach Content Provider");
      return null;
    }
  }, []);

  /** Updates the displayed item + its local caches — never touches the router. */
  const applyResolvedItem = useCallback((item: CpItem, nextAncestorNamePath: string[]) => {
    setCurrentItem(item);
    setNotFound(false);
    setAncestorNamePath(nextAncestorNamePath);
    if (usernameRef.current) {
      setLastCpAddress(usernameRef.current, item.Address.split("/")[0], item.Address);
    }
  }, []);

  /**
   * Story 120: the single place every real "current item changed" event
   * goes through — replaces the old `pushItem`. Always updates the URL
   * (source of truth for identity — see Task 1.6), which the shared
   * `DashboardHistoryProvider` picks up as a new Back/Forward entry. `mode:
   * "replace"` is reserved for the base-route → canonical-slug
   * canonicalization (Task 1.17) — every other call is a real new visit
   * and uses the default `"push"`. Also clears the local Wstecz/Naprzod
   * redo stack (`strippedLocaSegments`) unless `resetForwardStack: false`
   * — only `handleLocalBack`/`handleLocalForward` pass that, since those
   * are the two calls that manage the stack themselves.
   */
  const navigateToCpItem = useCallback(
    (item: CpItem, opts?: { mode?: "push" | "replace"; nextAncestorNamePath?: string[]; resetForwardStack?: boolean }) => {
      const href = cpAddressToFoldersHref(item.Address);
      appliedPathnameRef.current = href ?? pathname;
      if (href && href !== pathname) {
        if (opts?.mode === "replace") {
          notifyReplace();
          router.replace(href);
        } else {
          router.push(href);
        }
      }
      applyResolvedItem(item, opts?.nextAncestorNamePath ?? []);
      if (opts?.resetForwardStack !== false) {
        setStrippedLocaSegments([]);
      }
    },
    [applyResolvedItem, notifyReplace, pathname, router],
  );

  /** Wstecz — strips the current item's last loca segment (structural "up one level"), e.g. `14/07/02/01` -> `14/07/02`, pushing "01" onto the redo stack. */
  async function handleLocalBack() {
    if (!currentItem) return;
    const loca = relativeLoca(currentItem.Address, selectedRepoGuid);
    const segments = loca.split("/").filter(Boolean);
    if (segments.length === 0) return; // already at the repo root — nothing to strip
    const strippedSegment = segments[segments.length - 1];
    const parentLoca = segments.slice(0, -1).join("/");
    setLoading(true);
    try {
      const result = await fetchItem(selectedRepoGuid, parentLoca);
      if (result) {
        setStrippedLocaSegments((prev) => [...prev, strippedSegment]);
        navigateToCpItem(result.item, { nextAncestorNamePath: ancestorNamePath.slice(0, -1), resetForwardStack: false });
      }
    } finally {
      setLoading(false);
    }
  }

  /** Naprzod — pops the most recently stripped segment and appends it back to the current loca. */
  async function handleLocalForward() {
    if (strippedLocaSegments.length === 0 || !currentItem) return;
    const segmentToRestore = strippedLocaSegments[strippedLocaSegments.length - 1];
    const loca = relativeLoca(currentItem.Address, selectedRepoGuid);
    const childLoca = loca ? `${loca}/${segmentToRestore}` : segmentToRestore;
    setLoading(true);
    try {
      const result = await fetchItem(selectedRepoGuid, childLoca);
      if (result) {
        setStrippedLocaSegments((prev) => prev.slice(0, -1));
        navigateToCpItem(result.item, { nextAncestorNamePath: [...ancestorNamePath, result.item.Config.name], resetForwardStack: false });
      }
    } finally {
      setLoading(false);
    }
  }

  // Load the repo list + session identity once, then resolve the current
  // item from the URL (Task 3.4 — no root fetch first when a slug is
  // present, straight to the target). Wrapped in try/finally — a bare
  // `await` sequence with no catch meant any failure here (repos fetch
  // throwing, non-JSON response, etc.) left `loading` stuck `true` forever
  // with no item ever shown, which is what actually caused a previously
  // reported "spins forever until I click GO" (GO starts a fresh,
  // independent request/render cycle that can succeed even if the
  // mount-time one got stuck) — NOT a rendering bug, a swallowed
  // exception. Also now surfaces reposRes' own error instead of silently
  // leaving the repo list empty.
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [reposRes, sessionRes] = await Promise.all([
          fetch("/api/folders/repos"),
          fetch("/api/auth/session"),
        ]);
        const reposData: { repos?: RepoOption[]; error?: string } = await reposRes.json();
        if (!reposRes.ok || !reposData.repos) {
          setError(reposData.error ?? `Failed to load repo list (${reposRes.status})`);
          return;
        }
        setRepos(reposData.repos);
        reposRef.current = reposData.repos;

        const sessionData: { user?: { username?: string } } = await sessionRes.json().catch(() => ({}));
        const currentUsername = sessionData.user?.username ?? null;
        usernameRef.current = currentUsername;

        const slug = pathname.startsWith(`${FOLDERS_BASE_PATH}/`)
          ? pathname.slice(FOLDERS_BASE_PATH.length + 1)
          : null;

        if (slug) {
          // A slug is present in the URL — it's the sole source of truth
          // (Task 1.4/1.5): decode, confirm the repo is one this session
          // may browse, fetch directly. An invalid/forbidden/missing slug
          // renders a controlled not-found state, never a silent fallback
          // to a different item (that would be surprising for a bookmark/
          // shared link/new-tab open).
          const address = cpRouteSlugToAddress(slug);
          const repoGuid = address?.split("/")[0] ?? null;
          const allowed = repoGuid ? reposData.repos.some((r) => r.id === repoGuid) : false;
          if (!address || !repoGuid || !allowed) {
            setNotFound(true);
            return;
          }
          setSelectedRepoGuid(repoGuid);
          const result = await fetchItem(repoGuid, relativeLoca(address, repoGuid));
          if (!result) {
            setNotFound(true);
            return;
          }
          appliedPathnameRef.current = pathname;
          applyResolvedItem(result.item, []);
          return;
        }

        // Base route: try this user+repo's last visited address, falling
        // back to the repo root — then canonicalize the URL either way
        // (Task 1.5/1.12/1.17) so the bare route never lingers as its own
        // step in shared history.
        const initialRepoGuid = reposData.repos[0]?.id ?? "";
        setSelectedRepoGuid(initialRepoGuid);

        const lastAddress = currentUsername ? getLastCpAddress(currentUsername, initialRepoGuid) : null;
        let result = lastAddress ? await fetchItem(initialRepoGuid, relativeLoca(lastAddress, initialRepoGuid)) : null;
        if (lastAddress && !result && currentUsername) {
          // Stale/deleted/forbidden last address — drop it, fall back to root.
          clearLastCpAddress(currentUsername, initialRepoGuid);
        }
        if (!result) {
          result = await fetchItem(initialRepoGuid, "");
        }
        if (result) {
          navigateToCpItem(result.item, { mode: "replace" });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load Folders tab");
      } finally {
        setLoading(false);
      }
    })();
    // Run once on mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reacts to a URL change this page did NOT itself just make — real
  // browser/NavGroup Back-Forward, or a fresh SPA navigation landing on
  // this already-mounted route from elsewhere (e.g. the sidebar's Folders
  // link while already on Folders). Guarded by `appliedPathnameRef` so it
  // never re-resolves/re-fetches right after this page's own
  // `navigateToCpItem` already applied the same change (see that ref's own
  // doc comment) — and by `reposRef` so the spurious extra firing every
  // effect gets on first mount (before the mount effect above has loaded
  // anything yet) is a no-op, not a second, premature fetch. Never calls
  // the router itself for a real Back/Forward (Task 1.15) — only the
  // "landed on the bare base route some other way" branch canonicalizes,
  // same controlled `replace` as the mount effect.
  useEffect(() => {
    if (pathname === appliedPathnameRef.current) return;
    if (reposRef.current.length === 0) return;

    (async () => {
      setLoading(true);
      try {
        const slug = pathname.startsWith(`${FOLDERS_BASE_PATH}/`)
          ? pathname.slice(FOLDERS_BASE_PATH.length + 1)
          : null;

        if (!slug) {
          const initialRepoGuid = reposRef.current[0]?.id ?? "";
          setSelectedRepoGuid(initialRepoGuid);
          const lastAddress = usernameRef.current ? getLastCpAddress(usernameRef.current, initialRepoGuid) : null;
          let result = lastAddress
            ? await fetchItem(initialRepoGuid, relativeLoca(lastAddress, initialRepoGuid))
            : null;
          if (lastAddress && !result && usernameRef.current) {
            clearLastCpAddress(usernameRef.current, initialRepoGuid);
          }
          if (!result) result = await fetchItem(initialRepoGuid, "");
          if (result) navigateToCpItem(result.item, { mode: "replace" });
          return;
        }

        const address = cpRouteSlugToAddress(slug);
        const repoGuid = address?.split("/")[0] ?? null;
        const allowed = repoGuid ? reposRef.current.some((r) => r.id === repoGuid) : false;
        if (!address || !repoGuid || !allowed) {
          setNotFound(true);
          return;
        }
        setSelectedRepoGuid(repoGuid);
        const result = await fetchItem(repoGuid, relativeLoca(address, repoGuid));
        if (!result) {
          setNotFound(true);
          return;
        }
        appliedPathnameRef.current = pathname;
        applyResolvedItem(result.item, []);
      } finally {
        setLoading(false);
      }
    })();
  }, [pathname, fetchItem, navigateToCpItem, applyResolvedItem]);

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
      setCopyError(null);
      setEditorSyncKey(currentItem.Address);
    }
    // Intentionally keyed on Address, not the whole currentItem object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentItem?.Address, selectedRepoGuid]);

  /** GO is a structural jump to an arbitrary loca — a real identity change, so it still goes through navigateToCpItem (URL + shared history + local stack). */
  async function handleGo() {
    setLoading(true);
    try {
      const result = await fetchItem(selectedRepoGuid, locaInput);
      if (result) navigateToCpItem(result.item);
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
      if (result) navigateToCpItem(result.item, { nextAncestorNamePath: [...ancestorNamePath, result.item.Config.name] });
    } finally {
      setLoading(false);
    }
  }

  /** Switches to another repo from the session-granted list (own repo, or chad_shared) and loads its root fresh. */
  async function handleRepoChange(repoGuid: string) {
    if (repoGuid === selectedRepoGuid) return;
    setSelectedRepoGuid(repoGuid);
    setLocaInput("");
    setLoading(true);
    try {
      const result = await fetchItem(repoGuid, "");
      if (result) navigateToCpItem(result.item);
    } finally {
      setLoading(false);
    }
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

      setCurrentItem(data.parent);
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

/**
   * Imports a Folder CP item (+ subtree) from a .zip as a new child of the
   * currently-open Folder (Story 109). All CP import rules — structure,
   * security, atomicity, conflicts — live server-side in
   * packages/content-provider; this only uploads and reports the result.
   * Uses XMLHttpRequest (not fetch) specifically for `upload.onprogress` —
   * the only way to honestly distinguish "still uploading" from "server is
   * now validating/importing" with a single request/response round trip.
   *
   * `skipUnsupported`: only ever true on a RETRY, after `handleImportFileSelected`'s
   * first attempt failed with at least one individually-skippable error (Ref
   * items, .wav/.bak files — see isSkippableImportError) and the user
   * explicitly confirmed the dialog. Any OTHER, non-skippable errors present
   * alongside those still block the retry too (see the dialog's "Still
   * blocking" section) — skipping only ever narrows down what's left to fix,
   * never overrides a real problem.
   */
  function performImport(file: File, skipUnsupported: boolean) {
    if (!currentItem) return;
    setImportPhase("uploading");
    setImportError(null);

    const parentLoca = relativeLoca(currentItem.Address, selectedRepoGuid);
    const form = new FormData();
    form.append("file", file);
    form.append("parentLoca", parentLoca);
    if (selectedRepoGuid) form.append("repoGuid", selectedRepoGuid);
    if (skipUnsupported) form.append("skipUnsupported", "true");

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/folders/import");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.loaded >= e.total) setImportPhase("processing");
    };
    xhr.upload.onload = () => setImportPhase("processing");
    xhr.onerror = () => {
      setImportPhase("idle");
      setImportError("Network error while uploading");
    };
    xhr.onload = () => {
      setImportPhase("idle");
      let data: ImportApiResponse;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        setImportError(`Invalid server response (${xhr.status})`);
        return;
      }
      if (xhr.status < 200 || xhr.status >= 300 || !data.success) {
        const errs = data.validationErrors ?? [];
        const skippable = errs.filter(isSkippableImportError);
        const blocking = errs.filter((e) => !isSkippableImportError(e));
        if (!skipUnsupported && skippable.length > 0) {
          // At least one problem is one we know how to skip — offer the choice even
          // when other, non-skippable problems remain (skipping narrows down to just
          // those on retry, which the user still has to fix; see the dialog copy).
          setImportSkipConfirm({ file, skippable, blocking });
          return;
        }
        const detail = errs.length
          ? `${data.details ?? data.error}: ${errs.map((e) => `${e.path || "(archive)"} — ${e.message}`).join("; ")}`
          : (data.details ?? data.error ?? `Import failed (${xhr.status})`);
        setImportError(detail);
        return;
      }
      if (data.parent) setCurrentItem(data.parent);
      const skippedCount = data.skipped?.length ?? 0;
      toast.success(skippedCount > 0 ? `Imported ${data.createdItemCount ?? 0} item(s), skipped ${skippedCount}` : `Imported ${data.createdItemCount ?? 0} item(s)`);
    };
    xhr.send(form);
  }

  function handleImportFileSelected(file: File | undefined) {
    if (!file) return;
    if (importFileInputRef.current) importFileInputRef.current.value = "";
    if (!currentItem || importPhase !== "idle" || (protectingFolder && !isProtectedWriteUnlocked)) return;
    if (!file.name.toLowerCase().endsWith(".zip")) {
      setImportError("Only .zip files are accepted");
      return;
    }
    performImport(file, false);
  }

  function handleConfirmImportSkip() {
    if (!importSkipConfirm) return;
    const { file } = importSkipConfirm;
    setImportSkipConfirm(null);
    performImport(file, true);
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

      setCurrentItem(data.item);
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

      setCurrentItem(data.item);
      setConfigText(JSON.stringify(data.item.Config, null, 2));
      setConfigSaved(true);
      setTimeout(() => setConfigSaved(false), 3000);
    } catch (err) {
      setConfigSaveError(err instanceof Error ? err.message : "Nie udało się zapisać");
    } finally {
      setSavingConfig(false);
    }
  }

  /**
   * Read-only Folder-tree export → clipboard, for pasting context into AI
   * (Story 98). Always the server's saved data (a fresh GET), never the
   * local `editorBody`/`configText` drafts — works regardless of which is
   * currently dirty, and never touches either. Does not require unlocking a
   * protected system folder (Copy never writes).
   */
  async function handleCopyExport() {
    if (!currentItem || currentItem.Config.type !== "Folder" || copying) return;
    const loca = relativeLoca(currentItem.Address, selectedRepoGuid);

    setCopying(true);
    setCopyError(null);
    try {
      const query = new URLSearchParams({ loca, mode: exportMode });
      if (selectedRepoGuid) query.set("repoGuid", selectedRepoGuid);
      const res = await fetch(`/api/folders/export?${query}`);
      const data: FolderExportApiResponse = await res.json();
      if (!res.ok || !data.export) {
        setCopyError(data.details ?? data.error ?? `Request failed (${res.status})`);
        return;
      }

      const json = JSON.stringify(data.export, null, 2);
      try {
        await navigator.clipboard.writeText(json);
      } catch (err) {
        setCopyError(
          err instanceof Error ? `Nie udało się skopiować do schowka: ${err.message}` : "Nie udało się skopiować do schowka"
        );
        return;
      }

      toast.success(`Copied ${data.itemCount ?? data.export.items.length} item(s) — ${data.export.mode}`);
    } catch (err) {
      setCopyError(err instanceof Error ? err.message : "Nie udało się pobrać eksportu");
    } finally {
      setCopying(false);
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
    setDeleteStep("confirm-word");
    setDeleteChildCount(0);
    setDeleteError(null);
    setDeleteDialogOpen(true);
  }

  function openMoveDialog() {
    if (!currentItem) return;
    // Prefills with the item's CURRENT parent loca — a good starting point
    // to edit from, not a no-op default (the API itself treats "same
    // parent" as a harmless no-op success anyway, see moveFolderItem's doc
    // comment).
    const ownLoca = relativeLoca(currentItem.Address, selectedRepoGuid);
    const parentLoca = ownLoca.includes("/") ? ownLoca.slice(0, ownLoca.lastIndexOf("/")) : "";
    setMoveTargetLoca(parentLoca);
    setMoveError(null);
    setMoveDialogOpen(true);
  }

  /**
   * Reparents the currently-open item (+ its whole subtree, if it's a
   * Folder) under a different Folder in the same repo — the one write op
   * the Folders tab never had until now (Story 109 follow-up). On success,
   * jumps to the item's NEW parent so the user immediately sees it in its
   * new place (same "push the parent" convention `handleDeleteItem` uses).
   */
  /** Shared POST /api/folders/move call — used by both the button-triggered dialog and drag-and-drop. */
  async function performMoveRequest(loca: string, targetLoca: string): Promise<MoveApiResponse> {
    const res = await fetch("/api/folders/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        loca,
        targetLoca,
        allowSystemFolderWrite: isProtectedWriteUnlocked,
        repoGuid: selectedRepoGuid,
      }),
    });
    const data: MoveApiResponse = await res.json();
    if (!res.ok || !data.item) {
      return { ...data, error: data.details ?? data.error ?? `Request failed (${res.status})` };
    }
    return data;
  }

  async function handleMoveItem() {
    if (!currentItem || moving) return;
    const loca = relativeLoca(currentItem.Address, selectedRepoGuid);
    if (!loca) {
      setMoveError("Nie można przenieść głównego folderu repo");
      return;
    }

    setMoving(true);
    setMoveError(null);
    try {
      const data = await performMoveRequest(loca, moveTargetLoca.trim());
      if (!data.item) {
        setMoveError(data.error ?? "Request failed");
        return;
      }

      toast.success(data.moved ? "Element przeniesiony" : "Element już był w tym miejscu");
      setMoveDialogOpen(false);
      if (data.parent) {
        navigateToCpItem(data.parent, { nextAncestorNamePath: ancestorNamePath.slice(0, -1) });
      }
    } catch (err) {
      setMoveError(err instanceof Error ? err.message : "Nie udało się przenieść");
    } finally {
      setMoving(false);
    }
  }

  /**
   * Drag-and-drop move: grabbing a child row and dropping it onto a sibling
   * Folder row in the same list. The target's Folder-ness is only confirmed
   * server-side (the child list has no type info client-side, same reason
   * `isSkippableImportError`'s doc comment gives for not pre-guessing) — a
   * drop onto a Text item just surfaces PARENT_NOT_FOLDER in the confirm
   * dialog instead of silently failing. The new item always lands on the
   * next free numeric slot under the target — never a name/index the user
   * has to pick.
   */
  function handleChildDrop(targetIndex: string, targetName: string) {
    if (!currentItem || !draggedChild || draggedChild.index === targetIndex) return;
    const sourceAddress = `${currentItem.Address}/${draggedChild.index}`;
    const targetAddress = `${currentItem.Address}/${targetIndex}`;
    setDragMoveError(null);
    setDragMoveConfirm({
      sourceAddress,
      sourceName: draggedChild.name,
      targetAddress,
      targetName,
    });
  }

  async function handleConfirmDragMove() {
    if (!dragMoveConfirm || dragMoving) return;
    const sourceLoca = relativeLoca(dragMoveConfirm.sourceAddress, selectedRepoGuid);
    const targetLoca = relativeLoca(dragMoveConfirm.targetAddress, selectedRepoGuid);

    setDragMoving(true);
    setDragMoveError(null);
    try {
      const data = await performMoveRequest(sourceLoca, targetLoca);
      if (!data.item) {
        setDragMoveError(data.error ?? "Request failed");
        return;
      }

      toast.success(data.moved ? "Element przeniesiony" : "Element już był w tym miejscu");
      setDragMoveConfirm(null);
      // The moved item left the currently-shown folder's child list — refresh it in place.
      if (currentItem) {
        const refreshed = await fetchItem(selectedRepoGuid, relativeLoca(currentItem.Address, selectedRepoGuid));
        if (refreshed) setCurrentItem(refreshed.item);
      }
    } catch (err) {
      setDragMoveError(err instanceof Error ? err.message : "Nie udało się przenieść");
    } finally {
      setDragMoving(false);
    }
  }

  /**
   * Permanently deletes the currently-open item. Step 1 is retype-a-random-word
   * (Forms Daily/Date Entry pattern). If the open Folder still has children,
   * step 2 asks for an explicit Yes and then DELETE runs with `recursive=true`
   * (deepest-first cascade) instead of surfacing FOLDER_NOT_EMPTY as an error.
   */
  async function performDeleteItem(recursive: boolean) {
    if (!currentItem || deleting) return;
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
      if (recursive) query.set("recursive", "true");
      const res = await fetch(`/api/folders?${query}`, { method: "DELETE" });
      const data: { success?: boolean; parent?: CpItem | null; error?: string; details?: string } = await res.json();
      if (!res.ok || !data.success) {
        setDeleteError(data.details ?? data.error ?? `Request failed (${res.status})`);
        return;
      }

      toast.success(recursive ? "Folder i zawartość usunięte" : "Element usunięty");
      setDeleteDialogOpen(false);
      if (data.parent) {
        navigateToCpItem(data.parent, { nextAncestorNamePath: ancestorNamePath.slice(0, -1) });
      } else {
        sharedGoBack();
      }
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Nie udało się usunąć");
    } finally {
      setDeleting(false);
    }
  }

  async function handleDeleteConfirmWord() {
    if (!currentItem || deleting || deleteConfirmInput.trim() !== deleteConfirmWord) return;
    if (currentItem.Config.type === "Folder") {
      const childCount = parseFolderChildNameMap(currentItem.Body, currentItem.Config.sorting).length;
      if (childCount > 0) {
        setDeleteChildCount(childCount);
        setDeleteError(null);
        setDeleteStep("confirm-recursive");
        return;
      }
    }
    await performDeleteItem(false);
  }

  async function handleDeleteConfirmRecursive() {
    await performDeleteItem(true);
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

  // Same shared editor as Body (Preview | Editor | Save + helper row).
  // Story 95 used showPreview={false} for Config JSON; that diverged from the
  // one-editor standard and looked like a broken toolbar — keep the full UI.
  // defaultTab="editor" so Config opens on the editable JSON, not Preview.
  const configEditorBlock = (
    <div className="flex min-h-0 flex-1 flex-col space-y-2">
      <TextEditorWithToolbar
        key={editorSyncKey ? `${editorSyncKey}-config` : "config"}
        value={configText}
        onChange={handleConfigTextChange}
        onSave={handleSaveConfig}
        saving={savingConfig}
        saved={configSaved}
        saveDisabled={configSaveDisabled}
        defaultTab="editor"
        showSave={!protectingFolder || isProtectedWriteUnlocked}
        placeholder="Enter config JSON..."
        className="min-h-[360px] flex-1"
      />
    </div>
  );

  // Page-level errors — always the first frames above the main Folders chrome
  // so a failed Save/Import/Add is not buried next to a button lower down.
  const pageTopError =
    error ??
    importError ??
    (editorMode === "config" ? configParseError ?? configSaveError : configSaveError) ??
    saveError ??
    createError ??
    copyError;

  return (
    <DashboardPageShell title="Folders">
      <ErrorBox message={pageTopError} className="mb-3" />

      {/* Single nested frame wrapping nav + info + item content — previously nav had its own frame separate from the rest, extended per explicit request to cover everything down through the editor.
          `min-h-full` (not `h-full`): fills at least DashboardPageShell's
          frame height when content is short (so the Body/Config editor can
          flex-1 down to the bottom without a gap), but — unlike `h-full`,
          which caps this box at that height while `overflow: visible`
          content silently spills out past its own border — is free to grow
          TALLER than that when content needs more room, so the border
          always wraps the real content and DashboardPageShell's own
          `overflow-y-auto` (default) scrolls the whole frame, same as
          every other page using this shell.
          `shrink-0`: this div is a flex item of that `overflow-y-auto`
          column. `min-h-full` (`min-height: 100%`) REPLACES a flex item's
          default `min-height: auto` — the auto value is what normally
          stops a shrinkable flex item from being squashed below its own
          content size. With the default `flex-shrink: 1` still active and
          no `min-height: auto` protection left, the browser was shrinking
          this box down to exactly the scroll container's viewport height
          on a long tree, so the border (this box's own edge) ended well
          above the last row even though the rows themselves (normal flow,
          `overflow: visible`) kept rendering past it — the reported bug.
          `shrink-0` stops the shrink; the box then sizes to its real
          content (still never less than `min-h-full`), so the border
          always reaches the actual last item. Verified against the live
          long-tree repro (leads/all items, 72 rows) via DOM measurement
          before/after. */}
      <div className="flex min-h-full shrink-0 flex-col space-y-3 rounded-lg border bg-muted/10 p-3">
        <div className="shrink-0 space-y-2 border-b pb-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">Repo::</span>
            {/*
              Security (backlog/stories/60, extended in 96): this dropdown
              only ever holds the repos the backend session granted
              (/api/folders/repos) — the user's own repo, plus chad_shared
              for every user. It stays disabled while there is nothing
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
            {/* Structural address-tree up/redo — distinct from the shared,
                cross-page NavGroup Back/Forw above the frame; see
                `strippedLocaSegments`'s own doc comment. */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleLocalBack}
              disabled={!currentItem || relativeLoca(currentItem.Address, selectedRepoGuid) === ""}
              title="Wstecz — do folderu nadrzędnego (usuwa ostatni segment loca)"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={handleGo}>
              GO
            </Button>
            <Button variant="outline" size="sm" onClick={handleLocalForward} disabled={strippedLocaSegments.length === 0} title="Naprzód — cofnij ostatni Wstecz">
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
        ) : !currentItem && notFound ? (
          <p className="py-4 text-sm italic text-muted-foreground">
            Ten element nie istnieje lub nie masz do niego dostępu.
          </p>
        ) : !currentItem ? (
          <p className="py-4 text-sm italic text-muted-foreground">
            Nie udało się załadować żadnego itemu — sprawdź błąd powyżej i spróbuj ponownie (np. przyciskiem GO).
          </p>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col space-y-3">
            <div className="shrink-0 text-sm text-muted-foreground">
              <div>
                Address: <span className="font-mono">{currentItem.Address}</span>
              </div>
              <div>
                item-id: <span className="font-mono">{currentItem.Config.id}</span>
              </div>
              <div>
                Type: <span className="font-mono">{currentItem.Config.type}</span>
              </div>
              <div>
                Name: <span className="font-mono">{currentItem.Config.name}</span>
              </div>
            </div>

            {protectingFolder && (
              <div className="flex shrink-0 items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
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
            <div className="flex min-h-0 flex-1 flex-col space-y-2">
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={toggleEditorMode}>
                  {editorMode === "body" ? "Config" : "Body"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowMoreActions((v) => !v)}
                  aria-expanded={showMoreActions}
                >
                  <MoreHorizontal className="mr-1 h-3.5 w-3.5" />
                  More
                </Button>
              </div>
              {showMoreActions && (
                <div className="flex shrink-0 flex-wrap gap-2">
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
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={openMoveDialog}
                    disabled={Boolean(protectingFolder && !isProtectedWriteUnlocked)}
                    title={
                      protectingFolder && !isProtectedWriteUnlocked
                        ? `Managed by ${protectingFolder.managedBy} — read-only here`
                        : "Moves this item to a different Folder"
                    }
                  >
                    <FolderInput className="mr-1 h-3.5 w-3.5" />
                    Move
                  </Button>
                </div>
              )}
              {editorMode === "body" && (
                <TextEditorWithToolbar
                  // Remounts per item (Folders never unmounts this component
                  // between navigations) so the Preview format's
                  // auto-detection re-runs against THIS item's real body
                  // instead of staying stuck on whatever it detected for the
                  // very first item ever loaded on this page — also resets
                  // wch/undo-history/hdr1 color between unrelated items,
                  // which is the expected "different document" behavior.
                  // Keyed on `editorSyncKey`, not `currentItem.Address`
                  // directly — Address updates one render before
                  // `editorBody` does (separate effect), so keying on
                  // Address would remount with the PREVIOUS item's body
                  // still in `editorBody` and auto-detect against stale
                  // content; `editorSyncKey` is set in the same effect call
                  // as `editorBody`, so both land together.
                  key={editorSyncKey ?? "loading"}
                  value={editorBody}
                  onChange={handleEditorBodyChange}
                  onSave={handleSaveBody}
                  saving={savingBody}
                  saved={bodySaved}
                  showSave={!protectingFolder || isProtectedWriteUnlocked}
                  placeholder="Enter text body..."
                  className="min-h-[360px] flex-1"
                />
              )}
              {editorMode === "config" && configEditorBlock}
            </div>
          )}

          {currentItem.Config.type === "Folder" && (
            <div className="flex min-h-0 flex-1 flex-col space-y-2">
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={toggleEditorMode}>
                  {editorMode === "body" ? "Config" : "Body"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowMoreActions((v) => !v)}
                  aria-expanded={showMoreActions}
                >
                  <MoreHorizontal className="mr-1 h-3.5 w-3.5" />
                  More
                </Button>
              </div>
              {showMoreActions && (
                <div className="flex flex-wrap items-start gap-2">
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={openDeleteDialog}
                    disabled={Boolean(protectingFolder && !isProtectedWriteUnlocked)}
                    title={
                      protectingFolder && !isProtectedWriteUnlocked
                        ? `Managed by ${protectingFolder.managedBy} — read-only here`
                        : "Permanently deletes this folder (and contents after confirmation)"
                    }
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5" />
                    Delete
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={openMoveDialog}
                    disabled={Boolean(protectingFolder && !isProtectedWriteUnlocked)}
                    title={
                      protectingFolder && !isProtectedWriteUnlocked
                        ? `Managed by ${protectingFolder.managedBy} — read-only here`
                        : "Moves this Folder (+ its whole subtree) to a different Folder"
                    }
                  >
                    <FolderInput className="mr-1 h-3.5 w-3.5" />
                    Move
                  </Button>
                  {/*
                    Copy (Story 98): read-only Folder-tree export for pasting
                    context into AI. Independent of Body/Config mode (works in
                    either), always reads the server's saved data — never the
                    local editorBody/configText drafts, never requires
                    unlocking a protected system folder. Joined into one
                    vertical segmented control (combobox on top, Copy below) —
                    same "one connected control" idiom as the Preview|Editor
                    tab pair above, just stacked instead of side-by-side.
                  */}
                  <div className="flex flex-col gap-1 rounded-lg border bg-card p-1">
                    <Select value={exportMode} onValueChange={(v) => setExportMode(v as FolderExportMode)}>
                      <SelectTrigger
                        className="h-6 w-[100px] rounded-md border-0 bg-transparent px-3 text-xs font-medium shadow-none"
                        title="Copies saved data."
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="body-l1">body l1</SelectItem>
                        <SelectItem value="body-l2">body l2</SelectItem>
                        <SelectItem value="all-l1">all l1</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleCopyExport}
                      disabled={copying}
                      title="Copies saved data."
                      className="h-6 rounded-md px-3 text-xs font-medium"
                    >
                      <Copy className="mr-1 h-3 w-3" />
                      {copying ? "Copying..." : "Copy"}
                    </Button>
                  </div>
                  <input
                    ref={importFileInputRef}
                    type="file"
                    accept=".zip"
                    className="hidden"
                    onChange={(e) => handleImportFileSelected(e.target.files?.[0])}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => importFileInputRef.current?.click()}
                    disabled={importPhase !== "idle" || Boolean(protectingFolder && !isProtectedWriteUnlocked)}
                    title={
                      protectingFolder && !isProtectedWriteUnlocked
                        ? `Managed by ${protectingFolder.managedBy} — read-only here`
                        : "Import a Folder item (+ subtree) from a .zip"
                    }
                  >
                    <Upload className="mr-1 h-3.5 w-3.5" />
                    {importPhase === "uploading" ? "Uploading..." : importPhase === "processing" ? "Validating & importing..." : "Import"}
                  </Button>
                </div>
              )}
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
                  {createNotice && <p className="text-sm text-muted-foreground italic">{createNotice}</p>}

                  <div className="space-y-1">
                    {/*
                      Drag a child row and drop it onto another to move it
                      in there (Story 109 follow-up) — a lighter-weight path
                      to the same /api/folders/move the Move button uses.
                      Every drop still goes through a confirm dialog before
                      anything is sent; the target's own Folder-ness is only
                      confirmed server-side (see handleChildDrop's doc
                      comment), and the moved item always lands on the
                      target's next free numeric slot, never a name/index
                      picked here.
                    */}
                    {parseFolderChildNameMap(currentItem.Body, currentItem.Config.sorting).map(({ index, name }) => (
                      <div
                        key={index}
                        className="flex items-center gap-2 rounded-md"
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          handleChildDrop(index, name);
                        }}
                      >
                        <span className="w-8 shrink-0 font-mono text-xs text-muted-foreground">{index}</span>
                        <Button
                          variant="outline"
                          size="sm"
                          className="justify-start"
                          draggable
                          onDragStart={() => setDraggedChild({ index, name })}
                          onDragEnd={() => setDraggedChild(null)}
                          onClick={() => handleChildClick(index)}
                        >
                          {name}
                        </Button>
                      </div>
                    ))}
                    {parseFolderChildNameMap(currentItem.Body, currentItem.Config.sorting).length === 0 && (
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

      {/* Delete confirmation — step 1: retype a randomly-picked word (Forms
          Daily/Date Entry pattern). Step 2 (non-empty Folder only): explicit
          Yes for recursive delete instead of FOLDER_NOT_EMPTY error. */}
      <Dialog open={deleteDialogOpen} onOpenChange={(open) => !deleting && setDeleteDialogOpen(open)}>
        <DialogContent>
          {deleteStep === "confirm-word" ? (
            <>
              <DialogHeader>
                <DialogTitle>Delete this item?</DialogTitle>
                <DialogDescription>
                  This permanently removes{" "}
                  <span className="font-mono">{currentItem?.Config.name}</span>. This can&apos;t be undone.
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
                  onClick={handleDeleteConfirmWord}
                  disabled={deleting || deleteConfirmInput.trim() !== deleteConfirmWord}
                >
                  {deleting ? "Deleting..." : "Delete"}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Are you sure that you want to delete this item?</DialogTitle>
                <DialogDescription>
                  It has {deleteChildCount} child item{deleteChildCount === 1 ? "" : "s"}. This will
                  permanently remove{" "}
                  <span className="font-mono">{currentItem?.Config.name}</span> and everything inside
                  it. This can&apos;t be undone.
                </DialogDescription>
              </DialogHeader>
              <ErrorBox message={deleteError} className="mb-0" />
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setDeleteStep("confirm-word")}
                  disabled={deleting}
                >
                  Back
                </Button>
                <Button variant="destructive" onClick={handleDeleteConfirmRecursive} disabled={deleting}>
                  {deleting ? "Deleting..." : "Yes"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Move — reparents the current item (+ subtree) to a different Folder
          in the same repo. Target is typed as a loca (same slash-joined
          numeric-segment syntax as the top "Loca::" nav field, empty = repo
          root) rather than a tree picker — smallest UI that covers the real
          use case (Story 109 follow-up: regrouping existing items under a
          newly-created Folder). */}
      <Dialog open={moveDialogOpen} onOpenChange={(open) => !moving && setMoveDialogOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move this item?</DialogTitle>
            <DialogDescription>
              Moves <span className="font-mono">{currentItem?.Config.name}</span>
              {currentItem?.Config.type === "Folder" && " (and its whole subtree)"} to a different Folder in
              this repo. Currently at{" "}
              <span className="font-mono">
                {currentItem ? relativeLoca(currentItem.Address, selectedRepoGuid) || "(repo root)" : ""}
              </span>
              .
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Target loca (slash-joined, e.g. <span className="font-mono">24/01</span> — leave empty for the repo
              root). It will be placed on the target&apos;s next free slot — you never pick the exact index.
            </p>
            <Input
              value={moveTargetLoca}
              onChange={(e) => setMoveTargetLoca(e.target.value)}
              placeholder="np. 24/01"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleMoveItem();
              }}
            />
            <ErrorBox message={moveError} className="mb-0" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveDialogOpen(false)} disabled={moving}>
              Cancel
            </Button>
            <Button onClick={handleMoveItem} disabled={moving}>
              {moving ? "Moving..." : "Move"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Drag-and-drop move confirmation — both ends are already known (the
          dragged row, the row it was dropped on), so this is a plain
          yes/no, no target-loca text field. */}
      <Dialog open={dragMoveConfirm !== null} onOpenChange={(open) => !dragMoving && !open && setDragMoveConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move this item?</DialogTitle>
            <DialogDescription>
              Move <span className="font-mono">{dragMoveConfirm?.sourceName}</span> into{" "}
              <span className="font-mono">{dragMoveConfirm?.targetName}</span>? It will be placed on the next free
              slot inside it.
            </DialogDescription>
          </DialogHeader>
          <ErrorBox message={dragMoveError} className="mb-0" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDragMoveConfirm(null)} disabled={dragMoving}>
              Cancel
            </Button>
            <Button onClick={handleConfirmDragMove} disabled={dragMoving}>
              {dragMoving ? "Moving..." : "Move"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ZIP import — offered whenever at least one validation error is individually
          skippable (Ref items, .wav/.bak files, see isSkippableImportError). Other,
          non-skippable problems (shown separately below) still block the retry too —
          skipping only narrows down what's left to fix, it never overrides them. */}
      <Dialog open={importSkipConfirm !== null} onOpenChange={(open) => !open && setImportSkipConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import without unsupported items?</DialogTitle>
            <DialogDescription>
              {importSkipConfirm && importSkipConfirm.blocking.length > 0
                ? "This archive has some items the import can skip, and some other problems it can't work around. Skipping won't fully succeed until those are fixed too, but narrows down what's left."
                : "This archive contains items the import can't bring in. You can import everything else and skip just these, or cancel and fix the archive first."}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-60 space-y-2 overflow-y-auto text-sm">
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Will be skipped ({importSkipConfirm?.skippable.length ?? 0}):</p>
              {importSkipConfirm?.skippable.map((e, i) => (
                <div key={i} className="font-mono text-xs text-muted-foreground">
                  {e.path || "(archive)"} — {e.message}
                </div>
              ))}
            </div>
            {importSkipConfirm && importSkipConfirm.blocking.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-destructive">Still blocking ({importSkipConfirm.blocking.length}):</p>
                {importSkipConfirm.blocking.map((e, i) => (
                  <div key={i} className="font-mono text-xs text-destructive">
                    {e.path || "(archive)"} — {e.message}
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportSkipConfirm(null)}>
              Cancel
            </Button>
            <Button onClick={handleConfirmImportSkip}>
              {importSkipConfirm && importSkipConfirm.blocking.length > 0 ? "Retry without skippable items" : "Import anyway (skip these)"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardPageShell>
  );
}
