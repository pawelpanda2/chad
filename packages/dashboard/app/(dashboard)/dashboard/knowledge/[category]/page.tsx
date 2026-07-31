"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { DashboardPageShell } from "@/components/shared/dashboard-page-shell";
import { ErrorBox } from "@/components/shared/error-box";
import {
  FRAME_SECTION_GAP_CLASS,
  LIST_ROW_CLASS,
  LIST_ROW_WRAPPER_CLASS,
} from "@/components/shared/layout-tokens";

/**
 * Dynamic category view (Story 96) — replaces the static verbal-game page
 * (same frames/grid/tokens, different data source): sections are the
 * category's Folder children, document rows its Text grandchildren, all
 * from /api/knowledge/[category] (chad_shared/knowledge via dba), in CP
 * order. Clicking a document opens the read-only document route.
 */

interface KnowledgeDocumentRow {
  slug: string;
  name: string;
}

interface KnowledgeSection {
  name: string;
  documents: KnowledgeDocumentRow[];
}

interface KnowledgeCategoryView {
  slug: string;
  name: string;
  sections: KnowledgeSection[];
}

export default function KnowledgeCategoryPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category: categorySlug } = use(params);
  const router = useRouter();
  const [category, setCategory] = useState<KnowledgeCategoryView | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/knowledge/${encodeURIComponent(categorySlug)}`, {
          cache: "no-store",
        });
        const data: { category?: KnowledgeCategoryView; error?: string } = await res.json();
        if (cancelled) return;
        if (res.status === 404 || res.status === 400) {
          setNotFound(true);
          return;
        }
        if (!res.ok || !data.category) {
          setError(data.error ?? `Request failed (${res.status})`);
          return;
        }
        setCategory(data.category);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load category");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [categorySlug]);

  return (
    <DashboardPageShell
      title={category?.name ?? "Knowledge"}
      upLevel={{ href: "/dashboard/knowledge", label: "Knowledge" }}
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
          Nie znaleziono takiej kategorii w knowledge.
        </p>
      ) : category && category.sections.length === 0 ? (
        <p className="py-4 text-sm italic text-muted-foreground">
          Ta kategoria nie ma jeszcze żadnych sekcji — dodaj Folder Item w zakładce Folders.
        </p>
      ) : category ? (
        <div className={`grid grid-cols-1 md:grid-cols-2 ${FRAME_SECTION_GAP_CLASS}`}>
          {category.sections.map((section) => (
            <div key={section.name} className={LIST_ROW_WRAPPER_CLASS}>
              <h3 className="px-[10px] pt-1 pb-2 text-sm font-bold">{section.name}</h3>
              <div className="divide-y">
                {section.documents.map((doc) => (
                  <button
                    key={doc.slug}
                    type="button"
                    onClick={() =>
                      router.push(`/dashboard/knowledge/${category.slug}/${doc.slug}`)
                    }
                    className={`flex w-full items-center justify-between gap-3 text-left ${LIST_ROW_CLASS}`}
                  >
                    <span className="truncate text-sm">{doc.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">dokument</span>
                  </button>
                ))}
                {section.documents.length === 0 && (
                  <p className={`text-sm italic text-muted-foreground ${LIST_ROW_CLASS}`}>
                    Brak dokumentów
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </DashboardPageShell>
  );
}
