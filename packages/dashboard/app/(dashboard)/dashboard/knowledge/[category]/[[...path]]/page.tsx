"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { DashboardPageShell } from "@/components/shared/dashboard-page-shell";
import { ErrorBox } from "@/components/shared/error-box";
import { TextEditorWithToolbar } from "@/components/shared/text-editor-with-toolbar";
import { FRAME_SECTION_GAP_CLASS, LIST_ROW_CLASS, LIST_ROW_WRAPPER_CLASS } from "@/components/shared/layout-tokens";
import { KnowledgeGridRow } from "@/components/shared/knowledge-grid-row";
import { useKnowledgeGridLayout } from "@/components/shared/use-knowledge-grid-layout";
import {
  cpAddressToItemViewHref,
  cpAddressToKnowledgeHref,
  cpRouteSlugToParts,
  type CpAddressParts,
} from "@/lib/cp-address/route-codec";

/**
 * Knowledge folder/document browser (Story 96, Story 109 follow-up, Story
 * 114 intelligent grid, Story 120 follow-up address mode).
 *
 * Real knowledge trees are not a fixed category → section → document
 * (2-level) shape — some go 5+ levels deep — so this single catch-all page
 * (`[category]/[[...path]]`) replaces the old fixed `[category]` +
 * `[category]/[document]` pair: `path` is an arbitrary-depth chain of
 * slugs, and `/api/knowledge/[category]/[[...path]]` resolves it to
 * whichever kind of node is actually there.
 *
 * Story 120 follow-up ("address mode"): the shared Preview's CP-link needs
 * to open a Folder item's card-grid view for ANY CP address, not just ones
 * organized under the Knowledge menu tree — and per a live clarification, a
 * Folder CP-link should land HERE, not on Item View. Rather than a second,
 * parallel route (which `[[...path]]`'s catch-all would collide with
 * anyway — `/dashboard/knowledge/<anything>` already matches `category`
 * alone), this SAME page detects whether `category` (with no further
 * `path`) parses as a canonical CP address slug (`cpRouteSlugToParts` —
 * a Knowledge category's own name-slug is short and human-readable, so it
 * can never accidentally match the strict 36-char-UUID-prefixed format).
 * When it does, data comes from `/api/folders` (repoGuid+loca) instead of
 * `/api/knowledge/[category]/[[...path]]`, and every link this page
 * generates targets `/dashboard/knowledge/<childAddressSlug>` (Folder
 * children) or `/dashboard/item-view/<childAddressSlug>` (Text children)
 * instead of the name-based `knowledgePageHref`.
 *
 * Story 120 follow-up ("address mode" made canonical, per live feedback):
 * name mode is no longer a real parallel browsing UI — it still resolves a
 * name-slug URL server-side (so an old bookmark/link doesn't dead-end), but
 * the moment a node is resolved, this page immediately `router.replace`s to
 * that node's own address-based URL (`cpAddressToKnowledgeHref`/
 * `cpAddressToItemViewHref`, by `kind`) instead of rendering name-mode
 * cards/rows. A name-slug URL is therefore always a transient hop, never a
 * page the user actually looks at or clicks further from — the old
 * `knowledgePageHref`-based rendering below only remains as a defensive
 * fallback for the (should-not-happen) case where a resolved node somehow
 * has no address.
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
 * - `kind: "document"` (fallback rendering only — both modes now redirect a
 *   Text node straight to Item View instead of reaching this branch, see
 *   above): the same editable
 *   Preview/Editor toolbar every other single-document page in the app
 *   uses, inside `DashboardPageShell`, wired to `PUT` the same endpoint. A
 *   "shared" (chad_shared) document is only actually saveable by an admin
 *   session — a non-admin still sees the editor, but a save attempt
 *   surfaces the server's 403 via the error box.
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
  address: string;
}

interface KnowledgeDocumentView {
  kind: "document";
  slug: string;
  name: string;
  body: string;
  source: "shared" | "personal";
  breadcrumb: KnowledgeBreadcrumbSegment[];
  address: string;
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

/** Builds `/dashboard/knowledge/[category]/[...path]`, `path` may be empty (category root). Name mode only. */
function knowledgePageHref(categorySlug: string, pathSlugs: string[]): string {
  const encoded = pathSlugs.map(encodeURIComponent).join("/");
  return encoded ? `/dashboard/knowledge/${encodeURIComponent(categorySlug)}/${encoded}` : `/dashboard/knowledge/${encodeURIComponent(categorySlug)}`;
}

interface CpConfigLike {
  id: string;
  type: string;
  name: string;
  address: string;
  [key: string]: unknown;
}

interface CpItemLike {
  Body: string;
  Config: CpConfigLike;
  Address: string;
  ChildrenDetailed?: { index: string; name: string; type: string }[];
}

interface FolderApiResponseLike {
  item?: CpItemLike;
  error?: string;
}

export default function KnowledgeNodePage({
  params,
}: {
  params: Promise<{ category: string; path?: string[] }>;
}) {
  const { category: categorySlug, path: pathSlugs = [] } = use(params);
  const router = useRouter();
  const [node, setNode] = useState<KnowledgeNodeView | null>(null);
  const [nodeAddress, setNodeAddress] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editorBody, setEditorBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [cards, setCards] = useState<KnowledgeCard[] | null>(null);

  const pathKey = pathSlugs.join("/");
  const addressParts: CpAddressParts | null = pathSlugs.length === 0 ? cpRouteSlugToParts(categorySlug) : null;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setNotFound(false);
      setError(null);
      setCards(null);
      try {
        if (addressParts) {
          const query = new URLSearchParams({ loca: addressParts.loca, repoGuid: addressParts.repoGuid });
          const res = await fetch(`/api/folders?${query}`, { cache: "no-store" });
          const data: FolderApiResponseLike = await res.json();
          if (cancelled) return;
          if (!res.ok || !data.item) {
            setNotFound(true);
            return;
          }
          if (data.item.Config.type !== "Folder") {
            // A Text address landed here (deep link, stale bookmark) —
            // Item View is the canonical place for it, symmetric with Item
            // View redirecting a Folder address back to Knowledge.
            const href = cpAddressToItemViewHref(data.item.Address);
            if (href) router.replace(href);
            return;
          }

          setNodeAddress(data.item.Address);
          const directChildren: KnowledgeChildSummary[] = (data.item.ChildrenDetailed ?? []).map((c) => ({
            slug: c.index,
            name: c.name,
            type: c.type === "Folder" ? "Folder" : "Text",
          }));
          setNode({
            kind: "folder",
            slug: categorySlug,
            name: data.item.Config.name,
            source: "shared",
            breadcrumb: [],
            children: directChildren,
            address: data.item.Address,
          });

          const folderChildren = directChildren.filter((c) => c.type === "Folder");
          const cardResults = await Promise.all(
            folderChildren.map(async (child) => {
              const childLoca = addressParts.loca ? `${addressParts.loca}/${child.slug}` : child.slug;
              const childRes = await fetch(
                `/api/folders?${new URLSearchParams({ loca: childLoca, repoGuid: addressParts.repoGuid })}`,
                { cache: "no-store" },
              );
              const childData: FolderApiResponseLike = await childRes.json();
              const grandchildren: KnowledgeChildSummary[] = (childData.item?.ChildrenDetailed ?? []).map((g) => ({
                slug: g.index,
                name: g.name,
                type: g.type === "Folder" ? "Folder" : "Text",
              }));
              return { slug: child.slug, name: child.name, children: grandchildren };
            }),
          );
          if (!cancelled) setCards(cardResults);
          return;
        }

        // Name mode: resolve by name, then redirect straight to the
        // canonical address-based URL (Knowledge for a Folder, Item View
        // for a Text item) instead of rendering here — per live feedback, a
        // name-slug URL (e.g. /dashboard/knowledge/tematy-przed-lustrem/...)
        // should never be the one the user ends up looking at or clicking
        // deeper from, only ever a transient hop that immediately
        // canonicalizes. An old bookmark/link still resolves (no 404), it
        // just bounces to the address equivalent instead of rendering its
        // own parallel name-mode UI (which used to keep compounding
        // further name-slug segments on every click, including for Text
        // items that should have gone straight to Item View).
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
        const redirectHref =
          data.node.kind === "folder"
            ? cpAddressToKnowledgeHref(data.node.address)
            : cpAddressToItemViewHref(data.node.address);
        if (redirectHref) {
          router.replace(redirectHref);
          return;
        }

        // Fallback (should not happen — every CP item has an address):
        // render the old name-mode UI rather than dead-ending on nothing.
        setNode(data.node);
        setNodeAddress(null);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categorySlug, pathKey, addressParts?.repoGuid, addressParts?.loca, router]);

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

  if (node?.kind === "document") {
    return (
      <DashboardPageShell
        title={node.name}
        contentClassName="overflow-x-auto"
      >
        <ErrorBox message={saveError} className="mb-0 shrink-0" />
        {/* Desktop gutter comes from layout `main` (`xl:pr-[150px]` only) —
            never duplicate it here with unconditional mr-[150px] (mobile
            empty right strip — Story 117). Opt into collapsible helpers.
            The main frame (DashboardPageShell) owns scroll — both axes,
            same as every other DashboardPageShell page (`scroll` stays at
            its default `true`; `overflow-x-auto` above only adds
            horizontal, since the default hides it) — buttons and content
            both live inside this one frame instead of above it. */}
        <TextEditorWithToolbar
          // Remounts per document (this page never unmounts the editor
          // between in-place navigations) so Preview format auto-detection
          // re-runs against THIS document's real body instead of staying
          // stuck on whatever it detected for the first document ever
          // loaded here.
          key={`${categorySlug}/${pathKey}`}
          value={editorBody}
          onChange={handleEditorBodyChange}
          onSave={handleSaveBody}
          saving={saving}
          saved={saved}
          placeholder="Enter text body..."
          collapseEditorHelpers
          className="flex-1"
        />
      </DashboardPageShell>
    );
  }

  return (
    <DashboardPageShell
      title={node?.name ?? "Knowledge"}
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
            categorySlug={categorySlug}
            pathSlugs={pathSlugs}
            looseDocuments={looseDocuments}
            cards={cards}
            addressMode={addressParts !== null}
            nodeAddress={nodeAddress}
          />
        );
      })() : null}
    </DashboardPageShell>
  );
}

/** Approximate rendered height (px) of one `LIST_ROW_CLASS` row — used only to convert a "~N visible rows" height cap into a `maxHeight`, not a pixel-exact measurement. */
const APPROX_ROW_HEIGHT_PX = 42;

type GridCardEntry =
  | { kind: "loose"; key: "__loose__"; rows: KnowledgeChildSummary[] }
  | { kind: "folder"; key: string; card: KnowledgeCard };

/**
 * Knowledge v2 intelligent grid (Story 114, Task 2): same card visuals as
 * before (`LIST_ROW_WRAPPER_CLASS`/`LIST_ROW_CLASS`, Folder/Text icons via
 * `KnowledgeGridRow`) — only the arrangement algorithm changed. Up to 3
 * columns, each with its own width from `useKnowledgeGridLayout` (per-column
 * text-length heuristic), rows wrap instead of truncating. Height is
 * per-card only: every item shows in full up to
 * `maxVisibleRowsBeforeScroll` (10) items; a card with more gets capped to
 * that many visible rows plus its own scrollbar — independent of any other
 * card. `items-start` on the grid keeps cards from stretching to match
 * their row-mates, so a short card next to a tall one just ends where its
 * own content ends (titles across columns are not forced onto one line).
 * Every title/row is a real `<Link>` (via `KnowledgeGridRow`/the title link
 * below), so ctrl/cmd-click, middle-click, and "open in new tab" work for
 * both Folder and Text entries, same as any other link in the app.
 *
 * Story 120 follow-up: `addressMode`/`nodeAddress` switch every href this
 * component builds from the name-based `knowledgePageHref` to
 * `cpAddressToKnowledgeHref`/`cpAddressToItemViewHref` (Folder vs Text) —
 * `addressMode: false` (`knowledgePageHref`) is now reachable only via the
 * parent page's defensive fallback (a resolved node with no address, which
 * should not happen in practice — see the parent's own doc comment), since
 * name mode redirects away before this component ever renders for a normal
 * name-slug URL.
 */
function KnowledgeFolderGrid({
  categorySlug,
  pathSlugs,
  looseDocuments,
  cards,
  addressMode,
  nodeAddress,
}: {
  categorySlug: string;
  pathSlugs: string[];
  looseDocuments: KnowledgeChildSummary[];
  cards: KnowledgeCard[];
  addressMode: boolean;
  nodeAddress: string | null;
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

  function hrefFor(type: "Folder" | "Text", childSlug: string, baseAddress: string | null): string {
    if (addressMode && baseAddress) {
      const childAddress = `${baseAddress}/${childSlug}`;
      const href = type === "Folder" ? cpAddressToKnowledgeHref(childAddress) : cpAddressToItemViewHref(childAddress);
      return href ?? "#";
    }
    return "#";
  }

  return (
    <div
      ref={containerRef}
      className={`grid content-start items-start justify-start ${FRAME_SECTION_GAP_CLASS}`}
      style={{ gridTemplateColumns: widths.map((w) => `${w}px`).join(" ") }}
    >
      {gridCards.map((entry, index) => {
        const rows = entry.kind === "loose" ? entry.rows : entry.card.children;
        const cap = rowCaps[index];
        const basePathSlugs = entry.kind === "loose" ? pathSlugs : [...pathSlugs, entry.card.slug];
        const baseAddress =
          entry.kind === "loose" ? nodeAddress : nodeAddress ? `${nodeAddress}/${entry.card.slug}` : null;
        return (
          <div key={entry.key} className={`${LIST_ROW_WRAPPER_CLASS} min-w-0`}>
            {entry.kind === "folder" && (
              <Link
                href={
                  addressMode
                    ? (nodeAddress ? cpAddressToKnowledgeHref(`${nodeAddress}/${entry.card.slug}`) ?? "#" : "#")
                    : knowledgePageHref(categorySlug, [...pathSlugs, entry.card.slug])
                }
                className="block w-full break-words px-[10px] pt-1 pb-2 text-left text-sm font-bold hover:underline"
              >
                {entry.card.name}
              </Link>
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
                  href={
                    addressMode
                      ? hrefFor(row.type, row.slug, baseAddress)
                      : knowledgePageHref(categorySlug, [...basePathSlugs, row.slug])
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
