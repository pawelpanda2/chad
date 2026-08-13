"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  applyHistoryUrlChange,
  initialHistoryStackState,
  type HistoryStackState,
} from "@/lib/dashboard-history-reducer";

interface DashboardHistoryValue {
  canGoBack: boolean;
  canGoForward: boolean;
  goBack: () => void;
  goForward: () => void;
  /**
   * Call synchronously, immediately before a `router.replace(...)` that
   * canonicalizes the CURRENT history entry to a different URL for the
   * SAME conceptual identity (e.g. Folders' bare `/dashboard/folders`
   * resolving to `/dashboard/folders/<slug>` on load) — never for a
   * genuinely new navigation to a different item. Marks the next observed
   * URL change as replacing the current stack entry instead of pushing a
   * new one, so a plain visit to a base route never leaves a dead,
   * un-Back-able step in the shared history. See
   * `dashboard-history-reducer.ts`'s own doc comment for why this is an
   * explicit opt-in (Next gives no way to distinguish push from replace
   * just by observing the resulting URL) — deliberately narrow: only this
   * Story's Folders base-route canonicalization uses it, so every
   * pre-existing `router.replace` call site elsewhere in the dashboard
   * (Beeper/multiview/msg-workout/ai-prompts pages) keeps behaving exactly
   * as it did before, unaffected.
   */
  notifyReplace: () => void;
}

const DashboardHistoryContext = createContext<DashboardHistoryValue | null>(null);

/**
 * Tracks the dashboard's own visited-URL stack (`pathname` + full search
 * params), so `Back`/`Forw` (`nav-group.tsx`) can reliably know whether
 * there's anywhere to go — the raw browser History API doesn't expose
 * this across browsers. Story 120 replaced the previous URL-equality
 * heuristic (misclassified a fresh `A → B → A` navigation as a Back) with
 * a `popstate`-driven signal: real session-history navigation (browser
 * buttons, or our own `goBack`/`goForward`, which now call
 * `router.back()`/`router.forward()` instead of re-pushing a remembered
 * URL) always fires a native `popstate` event; `pushState`/`replaceState`
 * never do. See `dashboard-history-reducer.ts` for the actual (unit
 * tested) transition logic — this component only wires the browser/router
 * events to it.
 *
 * Plain React state, in RAM only — no `localStorage`/`sessionStorage`. A
 * page refresh clears it for free (the provider remounts from scratch);
 * Story 120's Folders keeps its own separate, smaller, per-repo/user
 * `lastAddress` in `localStorage` (see `lib/cp-address/last-address-store.ts`)
 * for restoring across a fresh visit — that's a different, narrower
 * mechanism, not this stack.
 */
export function DashboardHistoryProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const url = searchParams.toString() ? `${pathname}?${searchParams.toString()}` : pathname;

  const stateRef = useRef<HistoryStackState>(initialHistoryStackState(url));
  const isPopStateRef = useRef(false);
  const pendingReplaceRef = useRef(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    const handlePopState = () => {
      isPopStateRef.current = true;
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    const wasPopState = isPopStateRef.current;
    isPopStateRef.current = false;
    const wasReplace = pendingReplaceRef.current;
    pendingReplaceRef.current = false;

    const next = applyHistoryUrlChange(stateRef.current, { url, wasPopState, wasReplace });
    if (next !== stateRef.current) {
      stateRef.current = next;
      setTick((t) => t + 1);
    }
  }, [url]);

  const value = useMemo<DashboardHistoryValue>(() => {
    const s = stateRef.current;
    return {
      canGoBack: s.index > 0,
      canGoForward: s.index < s.entries.length - 1,
      goBack: () => {
        if (s.index > 0) router.back();
      },
      goForward: () => {
        if (s.index < s.entries.length - 1) router.forward();
      },
      notifyReplace: () => {
        pendingReplaceRef.current = true;
      },
    };
    // Re-derived whenever the URL changes (after the effect above updates
    // stateRef), via the `url` dependency below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, router]);

  return <DashboardHistoryContext.Provider value={value}>{children}</DashboardHistoryContext.Provider>;
}

export function useDashboardHistory(): DashboardHistoryValue {
  const ctx = useContext(DashboardHistoryContext);
  if (!ctx) {
    throw new Error("useDashboardHistory must be used within a DashboardHistoryProvider");
  }
  return ctx;
}
