"use client";

import { use, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { DashboardPageShell } from "@/components/shared/dashboard-page-shell";
import { ErrorBox } from "@/components/shared/error-box";
import { LIST_ROW_WRAPPER_CLASS } from "@/components/shared/layout-tokens";

/**
 * Read-only document view (Story 96) — shows one Text item's name + body
 * from chad_shared/knowledge (via /api/knowledge/[category]/[document]).
 * Deliberately read-only: structure/content editing happens in Folders,
 * not through a second CRUD panel here.
 */

interface KnowledgeDocumentView {
  slug: string;
  name: string;
  body: string;
  sectionName: string;
  category: { slug: string; name: string };
}

export default function KnowledgeDocumentPage({
  params,
}: {
  params: Promise<{ category: string; document: string }>;
}) {
  const { category: categorySlug, document: documentSlug } = use(params);
  const [doc, setDoc] = useState<KnowledgeDocumentView | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/knowledge/${encodeURIComponent(categorySlug)}/${encodeURIComponent(documentSlug)}`,
          { cache: "no-store" }
        );
        const data: { document?: KnowledgeDocumentView; error?: string } = await res.json();
        if (cancelled) return;
        if (res.status === 404 || res.status === 400) {
          setNotFound(true);
          return;
        }
        if (!res.ok || !data.document) {
          setError(data.error ?? `Request failed (${res.status})`);
          return;
        }
        setDoc(data.document);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load document");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [categorySlug, documentSlug]);

  return (
    <DashboardPageShell
      title={doc?.name ?? "Knowledge"}
      upLevel={{
        href: `/dashboard/knowledge/${encodeURIComponent(categorySlug)}`,
        label: doc?.category.name ?? "Kategoria",
      }}
    >
      <ErrorBox message={error} className="mb-3" />

      {loading ? (
        <div className="flex items-center gap-2 py-4 text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" />
          <span>Ładowanie...</span>
        </div>
      ) : notFound ? (
        <p className="py-4 text-sm italic text-muted-foreground">
          Nie znaleziono takiego dokumentu w knowledge.
        </p>
      ) : doc ? (
        <div className={LIST_ROW_WRAPPER_CLASS}>
          <div className="px-[10px] pt-1 pb-2">
            <h3 className="text-sm font-bold">{doc.name}</h3>
            <p className="text-xs text-muted-foreground">{doc.sectionName}</p>
          </div>
          {doc.body.trim() ? (
            <div className="whitespace-pre-wrap break-words px-[10px] pb-2 text-sm">
              {doc.body}
            </div>
          ) : (
            <p className="px-[10px] pb-2 text-sm italic text-muted-foreground">
              Ten dokument nie ma jeszcze treści — uzupełnij body w zakładce Folders.
            </p>
          )}
        </div>
      ) : null}
    </DashboardPageShell>
  );
}
