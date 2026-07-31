"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { DashboardPageShell } from "@/components/shared/dashboard-page-shell";
import { ErrorBox } from "@/components/shared/error-box";

/**
 * Hub for the Knowledge sidebar item — same button-grid pattern as Forms,
 * Views and Msg Automation. Since Story 96 the tiles are no longer
 * hardcoded: each Folder child of `chad_shared/knowledge` (via
 * /api/knowledge → dba) becomes one tile, in CP order — adding a category
 * in Folders adds a tile here with no frontend change.
 */

interface KnowledgeCategory {
  slug: string;
  name: string;
}

export default function KnowledgePage() {
  const router = useRouter();
  const [categories, setCategories] = useState<KnowledgeCategory[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/knowledge", { cache: "no-store" });
        const data: { categories?: KnowledgeCategory[]; error?: string } = await res.json();
        if (cancelled) return;
        if (!res.ok || !data.categories) {
          setError(data.error ?? `Request failed (${res.status})`);
          setCategories([]);
          return;
        }
        setCategories(data.categories);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load knowledge categories");
          setCategories([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <DashboardPageShell title="Knowledge">
      <ErrorBox message={error} className="mb-3" />

      {categories === null ? (
        <div className="flex items-center gap-2 py-4 text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" />
          <span>Ładowanie...</span>
        </div>
      ) : categories.length === 0 && !error ? (
        <p className="py-4 text-sm italic text-muted-foreground">
          Brak kategorii — dodaj Folder Item pod knowledge w repo chad_shared (zakładka Folders).
        </p>
      ) : (
        <div className="grid grid-cols-4 gap-2">
          {categories.map((category) => (
            <button
              key={category.slug}
              type="button"
              onClick={() => router.push(`/dashboard/knowledge/${category.slug}`)}
              className="flex flex-col items-center justify-center p-3 border rounded-lg hover:bg-accent hover:border-primary/50 transition-colors text-center min-h-[60px]"
            >
              <span className="font-semibold text-sm uppercase">{category.name}</span>
            </button>
          ))}
        </div>
      )}
    </DashboardPageShell>
  );
}
