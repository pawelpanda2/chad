"use client";

import { Folder as FolderIcon, FileText } from "lucide-react";
import { DashboardPageShell } from "@/components/shared/dashboard-page-shell";
import { FRAME_SECTION_GAP_CLASS, LIST_ROW_CLASS, LIST_ROW_WRAPPER_CLASS } from "@/components/shared/layout-tokens";

/**
 * Frozen GUI reference (Story 114): the Knowledge category view exactly as
 * it looked before the Task 2 intelligent-layout rebuild — fixed
 * `grid-cols-1 md:grid-cols-2`, single-line `truncate` rows, no height cap.
 *
 * Deliberately NOT a shared component with the real
 * `knowledge/[category]/[[...path]]/page.tsx` — this snapshot must stay
 * pixel-identical to "before" even after that page's layout changes, so its
 * markup/classes are duplicated here on purpose rather than imported.
 *
 * Local mock data only — no `/api/knowledge` fetch, no `chad_shared` reads.
 */

interface MockChild {
  slug: string;
  name: string;
  type: "Folder" | "Text";
}

interface MockCard {
  slug: string;
  name: string;
  children: MockChild[];
}

function textChildren(names: string[]): MockChild[] {
  return names.map((name, i) => ({ slug: `${name}-${i}`, name, type: "Text" as const }));
}

const LOOSE_DOCUMENTS: MockChild[] = textChildren(["Info ogólne", "Zasady tego działu"]);

const MOCK_CARDS: MockCard[] = [
  {
    slug: "pytania-od-dziewczyn",
    name: "Pytania od dziewczyn",
    children: textChildren(["Co robisz w weekend?"]),
  },
  {
    slug: "tematy-do-rozmowy",
    name: "Tematy do rozmowy",
    children: textChildren(["Pierwszy temat", "Drugi temat", "Trzeci temat", "Czwarty temat", "Piąty temat"]),
  },
  {
    slug: "historie",
    name: "Historie",
    children: textChildren(["Historia jeden", "Historia dwa", "Historia trzy"]),
  },
  {
    slug: "cwiczenia",
    name: "Ćwiczenia",
    children: textChildren(["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8"]),
  },
];

export default function KnowledgeV1ExamplePage() {
  return (
    <DashboardPageShell
      title="Knowledge v1"
      upLevel={{ href: "/dashboard/admin/examples", label: "Examples" }}
      contentClassName={FRAME_SECTION_GAP_CLASS}
    >
      <div className={`grid grid-cols-1 md:grid-cols-2 ${FRAME_SECTION_GAP_CLASS}`}>
        <MockCardGrid title={null} rows={LOOSE_DOCUMENTS} onRowClick={() => {}} />
        {MOCK_CARDS.map((card) => (
          <MockCardGrid
            key={card.slug}
            title={card.name}
            onTitleClick={() => {}}
            rows={card.children}
            onRowClick={() => {}}
          />
        ))}
      </div>
    </DashboardPageShell>
  );
}

function MockCardGrid({
  title,
  onTitleClick,
  rows,
  onRowClick,
}: {
  title: string | null;
  onTitleClick?: () => void;
  rows: MockChild[];
  onRowClick: (slug: string) => void;
}) {
  return (
    <div className={LIST_ROW_WRAPPER_CLASS}>
      {title !== null && (
        <button
          type="button"
          onClick={onTitleClick}
          className="w-full px-[10px] pt-1 pb-2 text-left text-sm font-bold hover:underline"
        >
          {title}
        </button>
      )}
      <div className="divide-y">
        {rows.map((row) => (
          <button
            key={row.slug}
            type="button"
            onClick={() => onRowClick(row.slug)}
            className={`flex w-full items-center gap-3 text-left ${LIST_ROW_CLASS}`}
          >
            {row.type === "Folder" ? (
              <FolderIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
            ) : (
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <span className="truncate text-sm">{row.name}</span>
          </button>
        ))}
        {rows.length === 0 && (
          <p className={`text-sm italic text-muted-foreground ${LIST_ROW_CLASS}`}>Brak elementów</p>
        )}
      </div>
    </div>
  );
}
