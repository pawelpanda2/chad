"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { DashboardPageShell } from "@/components/shared/dashboard-page-shell";
import { EditorPageShell } from "@/components/shared/editor-page-shell";
import { NavGroup } from "@/components/shared/nav-group";
import { ErrorBox } from "@/components/shared/error-box";
import { TextEditorWithToolbar } from "@/components/shared/text-editor-with-toolbar";
import { FRAME_SECTION_GAP_CLASS, LIST_ROW_CLASS, LIST_ROW_WRAPPER_CLASS } from "@/components/shared/layout-tokens";
import { KnowledgeGridRow } from "@/components/shared/knowledge-grid-row";
import { useKnowledgeGridLayout } from "@/components/shared/use-knowledge-grid-layout";

/**
 * Knowledge folder/document browser (Story 96, Story 109 follow-up, Story
 * 114 intelligent grid).
 *
 * Real knowledge trees are not a fixed category → section → document
 * (2-level) shape — some go 5+ levels deep — so this single catch-all page
 * (`[category]/[[...path]]`) replaces the old fixed `[category]` +
 * `[category]/[document]` pair: `path` is an arbitrary-depth chain of
 * slugs, and `/api/knowledge/[category]/[[...path]]` resolves it to
 * whichever kind of node is actually there.
 *
 * - `kind: "folder"` (the category itself when `path` is empty, or any
 *   Folder nested under it): a card per direct Folder child (fetched in
 *   parallel, one extra request per card — real categories have a handful
 *   of these, not hundreds); each card lists THAT folder's own children as
 *   clickable rows, so a Folder row inside a card opens another such
 *   card-grid one level deeper (the card grid repeats recursively, not
 *   just once below the category), and a Text row opens the document
 *   view. The current node's own direct Text children (a "documents
 *   scattered right here, not inside any sub-folder" case the old fixed
 *   category/section shape never had to handle) get one more, unlabeled
 *   card of their own so they're never a dead end. The card grid's
 *   *arrangement* (columns/widths/height caps) is `KnowledgeFolderGrid`
 *   below — Story 114 replaced its previous fixed `grid-cols-1
 *   md:grid-cols-2` with the intelligent up-to-3-column layout from
 *   `lib/knowledge-layout.ts` (frozen "before" reference:
 *   `/dashboard/examples/knowledge-v1`); card visuals themselves
 *   (`LIST_ROW_WRAPPER_CLASS`/`LIST_ROW_CLASS`, icons, typography) are
 *   unchanged.
 * - `kind: "document"`: the same editable Preview/Editor toolbar every
 *   other single-document page in the app uses (`EditorPageShell`), wired
 *   to `PUT` the same endpoint. A "shared" (chad_shared) document is only
 *   actually saveable by an admin session — a non-admin still sees the
 *   editor, but a save attempt surfaces the server's 403 via the error box.
 */

interface KnowledgeChildSummary {
  slug: string;
  name: string;
  type: "Folder" | "Text";
}

interface KnowledgeBreadcrumbSegment {
  slug: string;
  name: string;
}

interface KnowledgeFolderView {
  kind: "folder";
  slug: string;
  name: string;
  source: "shared" | "personal";
  breadcrumb: KnowledgeBreadcrumbSegment[];
  children: KnowledgeChildSummary[];
}

interface KnowledgeDocumentView {
  kind: "document";
  slug: string;
  name: string;
  body: string;
  source: "shared" | "personal";
  breadcrumb: KnowledgeBreadcrumbSegment[];
}

type KnowledgeNodeView = KnowledgeFolderView | KnowledgeDocumentView;

interface KnowledgeNodeApiResponse {
  node?: KnowledgeNodeView;
  error?: string;
  details?: string;
}

/** One card in the grid: a direct Folder child of the current node, plus that folder's own children (the card's rows). */
interface KnowledgeCard {
  slug: string;
  name: string;
  children: KnowledgeChildSummary[];
}

/** Builds `/dashboard/knowledge/[category]/[...path]`, `path` may be empty (category root). */
function knowledgePageHref(categorySlug: string, pathSlugs: string[]): string {
  const encoded = pathSlugs.map(encodeURIComponent).join("/");
  return encoded ? `/dashboard/knowledge/${encodeURIComponent(categorySlug)}/${encoded}` : `/dashboard/knowledge/${encodeURIComponent(categorySlug)}`;
}

export default function KnowledgeNodePage({
  params,
}: {
  params: Promise<{ category: string; path?: string[] }>;
}) {
  const { category: categorySlug, path: pathSlugs = [] } = use(params);
  const router = useRouter();
  const [node, setNode] = useState<KnowledgeNodeView | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editorBody, setEditorBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [cards, setCards] = useState<KnowledgeCard[] | null>(null);

  const pathKey = pathSlugs.join("/");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setNotFound(false);
      setError(null);
      setCards(null);
      try {
        const res = await fetch(
          `/api/knowledge/${encodeURIComponent(categorySlug)}${pathKey ? `/${pathKey}` : ""}`,
          { cache: "no-store" }
        );
        const data: KnowledgeNodeApiResponse = await res.json();
        if (cancelled) return;
        if (res.status === 404 || res.status === 400) {
          setNotFound(true);
          return;
        }
        if (!res.ok || !data.node) {
          setError(data.error ?? `Request failed (${res.status})`);
          return;
        }
        setNode(data.node);
        if (data.node.kind === "document") {
          setEditorBody(data.node.body);
          return;
        }

        // One extra request per direct Folder child, in parallel — fetches
        // that folder's own children so the card grid can show them as rows
        // without a second round-trip once the user clicks in.
        const folderChildren = data.node.children.filter((c) => c.type === "Folder");
        const cardResults = await Promise.all(
          folderChildren.map(async (child) => {
            const childPath = [...pathSlugs, child.slug].map(encodeURIComponent).join("/");
            const childRes = await fetch(`/api/knowledge/${encodeURIComponent(categorySlug)}/${childPath}`, {
              cache: "no-store",
            });
            const childData: KnowledgeNodeApiResponse = await childRes.json();
            const childrenOfCard = childData.node?.kind === "folder" ? childData.node.children : [];
            return { slug: child.slug, name: child.name, children: childrenOfCard };
          })
        );
        if (!cancelled) setCards(cardResults);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [categorySlug, pathKey]);

  function handleEditorBodyChange(value: string) {
    setEditorBody(value);
    if (saved) setSaved(false);
  }

  async function handleSaveBody() {
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(
        `/api/knowledge/${encodeURIComponent(categorySlug)}${pathKey ? `/${pathKey}` : ""}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: editorBody }),
        }
      );
      const data: KnowledgeNodeApiResponse = await res.json();
      if (!res.ok || !data.node) {
        setSaveError(data.details ?? data.error ?? `Request failed (${res.status})`);
        return;
      }
      setNode(data.node);
      if (data.node.kind === "document") setEditorBody(data.node.body);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Nie udało się zapisać");
    } finally {
      setSaving(false);
    }
  }

  // "Up one level": category root -> the Knowledge index; anywhere deeper ->
  // one path segment shallower (using the resolved breadcrumb's parent name
  // once loaded, falling back to the category slug before that arrives).
  const upHref =
    pathSlugs.length === 0
      ? "/dashboard/knowledge"
      : knowledgePageHref(categorySlug, pathSlugs.slice(0, -1));
  const upLabel =
    pathSlugs.length === 0
      ? "Knowledge"
      : (node?.breadcrumb[node.breadcrumb.length - (node.kind === "folder" ? 2 : 1)]?.name ?? categorySlug);

  if (node?.kind === "document") {
    return (
      <EditorPageShell>
        <div className="flex min-h-9 shrink-0 flex-wrap items-center gap-x-3 gap-y-1 pl-14">
          <NavGroup upLevel={{ href: upHref, label: upLabel }} />
          <h2 className="text-sm font-bold tracking-wide">{node.name}</h2>
        </div>
        <div className="px-14">
          <ErrorBox message={saveError} className="mb-2" />
        </div>
        <TextEditorWithToolbar
          value={editorBody}
          onChange={handleEditorBodyChange}
          onSave={handleSaveBody}
          saving={saving}
          saved={saved}
          placeholder="Enter text body..."
          className="mr-[150px]"
        />
      </EditorPageShell>
    );
  }

  return (
    <DashboardPageShell
      title={node?.name ?? "Knowledge"}
      upLevel={{ href: upHref, label: upLabel }}
      contentClassName={FRAME_SECTION_GAP_CLASS}
    >
      <ErrorBox message={error} className="mb-0" />

      {loading ? (
        <div className="flex items-center gap-2 py-4 text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" />
          <span>Ładowanie...</span>
        </div>
      ) : notFound ? (
        <p className="py-4 text-sm italic text-muted-foreground">
          Nie znaleziono takiego elementu w knowledge.
        </p>
      ) : node?.kind === "folder" && cards ? (() => {
        const looseDocuments = node.children.filter((c) => c.type === "Text");
        const isEmpty = cards.length === 0 && looseDocuments.length === 0;
        return isEmpty ? (
          <p className="py-4 text-sm italic text-muted-foreground">
            Brak elementów — dodaj Folder/Text Item w zakładce Folders.
          </p>
        ) : (
          <KnowledgeFolderGrid
            looseDocuments={looseDocuments}
            cards={cards}
            onLooseRowClick={(slug) => router.push(knowledgePageHref(categorySlug, [...pathSlugs, slug]))}
            onCardTitleClick={(card) => router.push(knowledgePageHref(categorySlug, [...pathSlugs, card.slug]))}
            onCardRowClick={(card, slug) =>
              router.push(knowledgePageHref(categorySlug, [...pathSlugs, card.slug, slug]))
            }
          />
        );
      })() : null}
    </DashboardPageShell>
  );
}

/** Approximate rendered height (px) of one `LIST_ROW_CLASS` row — used only to convert a "~N visible rows" height cap into a `maxHeight`, not a pixel-exact measurement (the heuristic in `lib/knowledge-layout.ts` is itself approximate, "about 5/8 rows"). */
const APPROX_ROW_HEIGHT_PX = 42;

type GridCardEntry =
  | { kind: "loose"; key: "__loose__"; rows: KnowledgeChildSummary[] }
  | { kind: "folder"; key: string; card: KnowledgeCard };

/**
 * Knowledge v2 intelligent grid (Story 114, Task 2): same card visuals as
 * before (`LIST_ROW_WRAPPER_CLASS`/`LIST_ROW_CLASS`, Folder/Text icons via
 * `KnowledgeGridRow`) — only the arrangement algorithm changed. Up to 3
 * columns, each with its own width from `useKnowledgeGridLayout` (per-column
 * text-length heuristic), rows wrap instead of truncating, and any card
 * whose item count exceeds its visual row's height cap gets a scrollable
 * `maxHeight` instead of growing unbounded.
 */
function KnowledgeFolderGrid({
  looseDocuments,
  cards,
  onLooseRowClick,
  onCardTitleClick,
  onCardRowClick,
}: {
  looseDocuments: KnowledgeChildSummary[];
  cards: KnowledgeCard[];
  onLooseRowClick: (slug: string) => void;
  onCardTitleClick: (card: KnowledgeCard) => void;
  onCardRowClick: (card: KnowledgeCard, slug: string) => void;
}) {
  const gridCards: GridCardEntry[] = [
    ...(looseDocuments.length > 0
      ? [{ kind: "loose" as const, key: "__loose__" as const, rows: looseDocuments }]
      : []),
    ...cards.map((card) => ({ kind: "folder" as const, key: card.slug, card })),
  ];

  const { containerRef, widths, rowCaps } = useKnowledgeGridLayout(
    gridCards.map((entry) => {
      const rows = entry.kind === "loose" ? entry.rows : entry.card.children;
      const title = entry.kind === "folder" ? entry.card.name : "";
      return { texts: [title, ...rows.map((r) => r.name)], itemCount: rows.length };
    })
  );

  return (
    <div
      ref={containerRef}
      className={`grid content-start justify-start ${FRAME_SECTION_GAP_CLASS}`}
      style={{ gridTemplateColumns: widths.map((w) => `${w}px`).join(" ") }}
    >
      {gridCards.map((entry, index) => {
        const rows = entry.kind === "loose" ? entry.rows : entry.card.children;
        const cap = rowCaps[index];
        return (
          <div key={entry.key} className={`${LIST_ROW_WRAPPER_CLASS} min-w-0`}>
            {entry.kind === "folder" && (
              <button
                type="button"
                onClick={() => onCardTitleClick(entry.card)}
                className="w-full break-words px-[10px] pt-1 pb-2 text-left text-sm font-bold hover:underline"
              >
                {entry.card.name}
              </button>
            )}
            <div
              className="divide-y overflow-y-auto overflow-x-hidden"
              style={cap !== null ? { maxHeight: `${cap * APPROX_ROW_HEIGHT_PX}px` } : undefined}
            >
              {rows.map((row) => (
                <KnowledgeGridRow
                  key={row.slug}
                  type={row.type}
                  name={row.name}
                  onClick={() =>
                    entry.kind === "loose" ? onLooseRowClick(row.slug) : onCardRowClick(entry.card, row.slug)
                  }
                />
              ))}
              {rows.length === 0 && (
                <p className={`text-sm italic text-muted-foreground ${LIST_ROW_CLASS}`}>Brak elementów</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
