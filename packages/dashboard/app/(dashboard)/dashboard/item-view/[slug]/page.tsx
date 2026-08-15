"use client";

/**
 * `/dashboard/item-view/<address-slug>` — Story 120 follow-up: a chrome-free
 * "full view" of a single CP TEXT item, addressed by its canonical CP
 * address (`lib/cp-address/route-codec.ts`), not by a Knowledge-style
 * logical name slug. This is what the shared Preview's CP-link opens for a
 * Text target (via `by-id/[id]/page.tsx`'s type-aware redirect) — the same
 * idea as opening a Knowledge document (`DashboardPageShell` +
 * `TextEditorWithToolbar`, no Add/Delete/Move/repo-picker/Loca-input
 * browsing chrome), generalized to any CP address.
 *
 * A Folder address landing here (deep link, stale link after a Move, etc.)
 * redirects to the equivalent Knowledge address view instead of rendering
 * here — per a live Story 120 clarification, Folder items stay in
 * Knowledge's own card-grid view, never Item View.
 *
 * Reads/writes through the exact same `/api/folders` GET/PUT the Folders
 * tab already uses (repo/session access re-validated server-side there —
 * this page adds no new authorization surface).
 */

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { DashboardPageShell } from "@/components/shared/dashboard-page-shell";
import { ErrorBox } from "@/components/shared/error-box";
import { TextEditorWithToolbar } from "@/components/shared/text-editor-with-toolbar";
import { cpAddressToKnowledgeHref, cpRouteSlugToParts } from "@/lib/cp-address/route-codec";

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
  error?: string;
}

const ITEM_VIEW_BASE_PATH = "/dashboard/item-view";

export default function ItemViewPage() {
  const pathname = usePathname();
  const router = useRouter();
  const [item, setItem] = useState<CpItem | null>(null);
  const [repoGuid, setRepoGuid] = useState("");
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editorBody, setEditorBody] = useState("");
  const [editorSyncKey, setEditorSyncKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    const slug = pathname.startsWith(`${ITEM_VIEW_BASE_PATH}/`)
      ? pathname.slice(ITEM_VIEW_BASE_PATH.length + 1)
      : null;
    const parts = slug ? cpRouteSlugToParts(slug) : null;
    if (!parts) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      setNotFound(false);
      setError(null);
      try {
        const query = new URLSearchParams({ loca: parts.loca, repoGuid: parts.repoGuid });
        const res = await fetch(`/api/folders?${query}`);
        const data: FolderApiResponse = await res.json();
        if (cancelled) return;
        if (!res.ok || !data.item || !data.repoGuid) {
          setNotFound(true);
          return;
        }
        if (data.item.Config.type === "Folder") {
          const knowledgeHref = cpAddressToKnowledgeHref(data.item.Address);
          if (knowledgeHref) {
            router.replace(knowledgeHref);
            return;
          }
        }
        setItem(data.item);
        setRepoGuid(data.repoGuid);
        setEditorBody(data.item.Body);
        setEditorSyncKey(data.item.Address);
        setSaved(false);
        setSaveError(null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to reach Content Provider");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  async function handleSave() {
    if (!item || saving) return;
    const loca = item.Address === repoGuid ? "" : item.Address.slice(repoGuid.length + 1);
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/folders", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loca, body: editorBody, repoGuid }),
      });
      const data: FolderApiResponse = await res.json();
      if (!res.ok || !data.item) {
        setSaveError(data.error ?? `Request failed (${res.status})`);
        return;
      }
      setItem(data.item);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Nie udało się zapisać");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <DashboardPageShell title="Item">
        <div className="flex items-center gap-2 py-4 text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" />
          <span>Ładowanie...</span>
        </div>
      </DashboardPageShell>
    );
  }

  if (notFound || !item) {
    return (
      <DashboardPageShell title="Item">
        <ErrorBox message={error} className="mb-0" />
        <p className="py-4 text-sm italic text-muted-foreground">
          Ten element nie istnieje lub nie masz do niego dostępu.
        </p>
      </DashboardPageShell>
    );
  }

  return (
    <DashboardPageShell title={item.Config.name || item.Config.type} contentClassName="overflow-x-auto">
      <ErrorBox message={error ?? saveError} className="mb-0 shrink-0" />
      <TextEditorWithToolbar
        key={editorSyncKey ?? undefined}
        value={editorBody}
        onChange={(value) => {
          setEditorBody(value);
          if (saved) setSaved(false);
        }}
        onSave={handleSave}
        saving={saving}
        saved={saved}
        placeholder="Enter text body..."
        collapseEditorHelpers
        className="flex-1"
      />
    </DashboardPageShell>
  );
}
