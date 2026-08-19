"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  applyHistoryUrlChange,
  initialHistoryStackState,
  type HistoryStackState,
} from "@/lib/dashboard-history-reducer";

/** The small slice of the browser Navigation API this file needs — not yet in TS's DOM lib types. */
interface NavigateEventLike {
  navigationType: "push" | "replace" | "reload" | "traverse";
}
interface NavigationApiLike {
  addEventListener(type: "navigate", listener: (event: NavigateEventLike) => void): void;
  removeEventListener(type: "navigate", listener: (event: NavigateEventLike) => void): void;
}

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
   * just by observing the resulting URL) — deliberately narrow: only
   * Folders' base-route canonicalization uses it, so every other
   * pre-existing `router.replace` call site elsewhere in the dashboard
   * (Beeper/msg-workout/ai-prompts pages, and Multiview's own
   * non-step updates — its default-group effect and group-filter change,
   * since Story 127 switched Multiview's actual navigation steps —
   * tab change and conversation selection — to `router.push` instead) keeps
   * behaving exactly as it did before, unaffected.
   */
  notifyReplace: () => void;
  /**
   * Read-only snapshot of the tracked stack, for the LOCAL-only history
   * debug combobox (Story 126, `nav-group.tsx`) — never a second store, just
   * a view onto the same `stateRef` the provider already keeps. Never
   * written to; RAM-only, same lifetime as everything else here.
   */
  debug: {
    entries: string[];
    index: number;
    currentEntry: string;
  };
  /**
   * Resets the tracked stack to `{ entries: [currentUrl], index: 0 }` —
   * Story 127, Dev Panel Debug's "Clear". The current page/state stays on
   * screen (this never navigates); only the `↶`/`↷` stack forgets prior
   * steps, both immediately disabled since there's nothing to go back/
   * forward to until new navigation happens. Does not touch `←` (hierarchy
   * is a separate, stateless resolver — see `lib/dashboard-hierarchy.ts`).
   */
  clearHistory: () => void;
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
/**
 * Story 127 — Dev Panel (mounted at the ROOT layout, `app/layout.tsx`, as a
 * sibling in the tree to `(dashboard)/layout.tsx` where this provider
 * actually lives) needs to read/clear the SAME stack for its Debug tab's
 * Copy/Clear buttons, but can't call `useDashboardHistory()` — it has no
 * `DashboardHistoryProvider` ancestor. Since exactly one instance of this
 * provider is ever mounted (it wraps the whole dashboard), a plain module
 * singleton — kept in sync by the provider itself on every render — is
 * simpler and safer here than restructuring the mount tree just to thread
 * React Context across an unrelated boundary.
 */
let activeHistoryBridge: { entries: string[]; index: number; clearHistory: () => void } | null = null;

/** Read-only snapshot for Dev Panel Debug's Copy button. `null` if no dashboard page is mounted. */
export function getActiveNavigationHistorySnapshot(): { entries: string[]; index: number } | null {
  if (!activeHistoryBridge) return null;
  return { entries: activeHistoryBridge.entries, index: activeHistoryBridge.index };
}

/** For Dev Panel Debug's Clear button. No-op if no dashboard page is mounted. */
export function clearActiveNavigationHistory(): void {
  activeHistoryBridge?.clearHistory();
}

export function DashboardHistoryProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const url = searchParams.toString() ? `${pathname}?${searchParams.toString()}` : pathname;

  const stateRef = useRef<HistoryStackState>(initialHistoryStackState(url));
  const isPopStateRef = useRef(false);
  const pendingReplaceRef = useRef(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    // Story 126 fix: Next.js's App Router client navigation reacts to the
    // browser's Navigation API (`window.navigation`, Chromium/Edge/newer
    // Safari) where available, which fires its `navigate` event — and
    // Next's own resulting pathname update, which is what actually drives
    // this component's re-render — measurably BEFORE the legacy `popstate`
    // event a plain `window.addEventListener("popstate", ...)` observes
    // (confirmed empirically: the url-change effect below was consistently
    // running ~1ms before our own popstate handler even fired, meaning
    // `isPopStateRef.current` was always still `false` — every real
    // Back/Forward was being misclassified as a fresh push, permanently
    // breaking Forward after any Back). The Navigation API's
    // `navigationType` (`"push" | "replace" | "reload" | "traverse"`) is
    // also a direct, unambiguous signal — `"traverse"` covers both
    // directions of real session-history navigation — rather than the
    // popstate-only approach's implicit "an event fired" heuristic.
    // Falls back to `popstate` on browsers without the Navigation API.
    const nav = (window as unknown as { navigation?: NavigationApiLike }).navigation;
    if (nav) {
      const handleNavigate = (event: NavigateEventLike) => {
        if (event.navigationType === "traverse") {
          isPopStateRef.current = true;
        }
      };
      nav.addEventListener("navigate", handleNavigate);
      return () => nav.removeEventListener("navigate", handleNavigate);
    }

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
      debug: {
        entries: s.entries,
        index: s.index,
        currentEntry: s.entries[s.index],
      },
      clearHistory: () => {
        stateRef.current = initialHistoryStackState(url);
        setTick((t) => t + 1);
      },
    };
    // Re-derived whenever the URL changes OR the effect above finishes
    // mutating `stateRef` for that same URL (the `tick` bump — Story 126
    // fix: `tick`'s own VALUE is unused inside the factory, only its
    // presence in this dependency array matters, because without it a
    // `setTick` on an already-stable `url` re-renders the component but
    // this memo would keep the STALE closure from the render before the
    // effect ran, leaving canGoBack/canGoForward/debug one navigation
    // behind their real value).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, router, tick]);

  useEffect(() => {
    activeHistoryBridge = { entries: value.debug.entries, index: value.debug.index, clearHistory: value.clearHistory };
    return () => {
      activeHistoryBridge = null;
    };
  }, [value]);

  return <DashboardHistoryContext.Provider value={value}>{children}</DashboardHistoryContext.Provider>;
}

export function useDashboardHistory(): DashboardHistoryValue {
  const ctx = useContext(DashboardHistoryContext);
  if (!ctx) {
    throw new Error("useDashboardHistory must be used within a DashboardHistoryProvider");
  }
  return ctx;
}
