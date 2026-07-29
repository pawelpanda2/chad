"use client";

import { DashboardPageShell } from "@/components/shared/dashboard-page-shell";
import {
  FRAME_SECTION_GAP_CLASS,
  LIST_ROW_CLASS,
  LIST_ROW_WRAPPER_CLASS,
} from "@/components/shared/layout-tokens";

/**
 * Static content ported from the owner's HTML mockup
 * (examples/chad-knowledge-verbal-game-mockup.html). Links are placeholders
 * only — no document routing/CRUD/search yet, that's left to later stories
 * (see human-docs/dashboard/knowledge/features once written).
 */
interface DocLink {
  label: string;
  kind: string;
}

interface DocGroup {
  title: string;
  links: DocLink[];
}

const GROUPS: DocGroup[] = [
  {
    title: "Podstawy rozmowy",
    links: [
      { label: "Jak rozwijać temat zamiast go ucinać", kind: "dokument" },
      { label: "Pytania otwarte i follow-upy", kind: "dokument" },
      { label: "Skojarzenia i nowe wątki", kind: "ćwiczenie" },
      { label: "Unikanie trybu wywiadu", kind: "dokument" },
    ],
  },
  {
    title: "Historie i opowiadanie",
    links: [
      { label: "Struktura krótkiej historii", kind: "dokument" },
      { label: "Historie z dzieciństwa", kind: "biblioteka" },
      { label: "Ćwiczenie: historia w 60 sekund", kind: "ćwiczenie" },
      { label: "Puenta, emocja i detal", kind: "dokument" },
    ],
  },
  {
    title: "Flirt i man-to-woman",
    links: [
      { label: "Premisa i intencja", kind: "dokument" },
      { label: "Teasing i lekka prowokacja", kind: "dokument" },
      { label: "Komplement sytuacyjny", kind: "przykłady" },
      { label: "Ćwiczenie: flirtujące skojarzenia", kind: "ćwiczenie" },
    ],
  },
  {
    title: "Tematy i inspiracje",
    links: [
      { label: "Podróże i miejsca", kind: "tematy" },
      { label: "Styl, wnętrza i kultura", kind: "tematy" },
      { label: "Relacje, ambicje i wartości", kind: "tematy" },
      { label: "Zabawne obserwacje z codzienności", kind: "biblioteka" },
    ],
  },
  {
    title: "Ćwiczenia solo",
    links: [
      { label: "10 skojarzeń do jednego słowa", kind: "5 min" },
      { label: "Mówienie bez przerwy przez 3 minuty", kind: "3 min" },
      { label: "Rozwijanie jednego szczegółu", kind: "5 min" },
      { label: "Losowy temat dnia", kind: "ćwiczenie" },
    ],
  },
  {
    title: "Analiza i poprawa",
    links: [
      { label: "Dlaczego rozmowa traci energię", kind: "dokument" },
      { label: "Lista powtarzających się błędów", kind: "tracker" },
      { label: "Co mogłem powiedzieć zamiast", kind: "szablon" },
      { label: "Powtórka po randce", kind: "ćwiczenie" },
    ],
  },
];

export default function KnowledgeVerbalGamePage() {
  return (
    <DashboardPageShell
      title="Verbal Game"
      upLevel={{ href: "/dashboard/knowledge", label: "Knowledge" }}
      contentClassName={FRAME_SECTION_GAP_CLASS}
    >
      <div className={`grid grid-cols-1 md:grid-cols-2 ${FRAME_SECTION_GAP_CLASS}`}>
        {GROUPS.map((group) => (
          <div key={group.title} className={LIST_ROW_WRAPPER_CLASS}>
            <h3 className="px-[10px] pt-1 pb-2 text-sm font-bold">{group.title}</h3>
            <div className="divide-y">
              {group.links.map((link) => (
                <div
                  key={link.label}
                  className={`flex items-center justify-between gap-3 ${LIST_ROW_CLASS}`}
                >
                  <span className="truncate text-sm">{link.label}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{link.kind}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </DashboardPageShell>
  );
}
