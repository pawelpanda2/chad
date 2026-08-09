"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import {
  DEFAULT_KNOWLEDGE_LAYOUT_PARAMS,
  chooseColumnsAndWidths,
  computeRowCaps,
  type KnowledgeLayoutParams,
} from "@/lib/knowledge-layout";

export interface KnowledgeGridCardInput {
  /** Card title + every item label routed into it — feeds the per-column width heuristic. */
  texts: string[];
  /** Item count — feeds this card's own height cap (independent of other cards). */
  itemCount: number;
}

export interface KnowledgeGridLayout {
  containerRef: RefObject<HTMLDivElement | null>;
  cols: number;
  widths: number[];
  /** One entry per card, same order as `cards`; `null` = no height cap (shows every item) for that card. */
  rowCaps: Array<number | null>;
}

/**
 * DOM half of the Knowledge v2 intelligent grid layout (Story 114): tracks
 * the container's real available width via `ResizeObserver`, measures real
 * rendered text width through a hidden probe span appended inside the
 * container (so it inherits the grid's own font), and feeds both into the
 * pure `chooseColumnsAndWidths` / `computeRowCaps` from `lib/knowledge-layout`.
 * Kept separate from that pure module so the actual column/width/height math
 * stays unit-testable without jsdom.
 */
export function useKnowledgeGridLayout(
  cards: KnowledgeGridCardInput[],
  params: KnowledgeLayoutParams = DEFAULT_KNOWLEDGE_LAYOUT_PARAMS
): KnowledgeGridLayout {
  const containerRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<{ cols: number; widths: number[] }>({
    cols: 1,
    widths: [params.minColumnWidthPx],
  });

  // Recompute whenever the actual card contents change shape (new category
  // navigated to, data finished loading), not just on resize.
  const cardsKey = cards.map((c) => `${c.itemCount}:${c.texts.join(" ")}`).join("");

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const measureText = (probe: string): number => {
      const span = document.createElement("span");
      span.style.cssText = "position:absolute;visibility:hidden;white-space:nowrap;left:-9999px;top:-9999px;";
      span.textContent = probe;
      el.appendChild(span);
      const width = span.getBoundingClientRect().width;
      el.removeChild(span);
      return width;
    };

    const recompute = () => {
      const available = Math.max(params.minColumnWidthPx, el.clientWidth);
      const cardTexts = cards.map((c) => c.texts);
      setLayout(chooseColumnsAndWidths(available, cardTexts, measureText, params));
    };

    recompute();

    let resizeTimeout: ReturnType<typeof setTimeout> | undefined;
    const observer = new ResizeObserver(() => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(recompute, 80);
    });
    observer.observe(el);

    return () => {
      clearTimeout(resizeTimeout);
      observer.disconnect();
    };
    // `cards`/`params` are intentionally summarized via `cardsKey` above —
    // re-running per-render on a fresh `cards` array identity would defeat
    // the resize debounce.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardsKey, params]);

  const rowCaps = computeRowCaps(
    cards.map((c) => c.itemCount),
    params
  );

  return { containerRef, cols: layout.cols, widths: layout.widths, rowCaps };
}
